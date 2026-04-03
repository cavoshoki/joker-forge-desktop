pub mod context;
pub mod conditions;
pub mod effects;
pub mod triggers;
pub mod values;

use crate::lua_ast::*;
use crate::types::*;
use context::CompileContext;

/// Compile a complete joker definition into a Lua chunk.
pub fn compile_joker(joker: &JokerDef, mod_prefix: &str) -> Chunk {
    let mut ctx = CompileContext::new(
        ObjectType::Joker,
        mod_prefix.to_string(),
        joker.key.clone(),
        joker.blueprint_compat,
    );
    ctx.set_user_vars(joker.user_variables.clone());

    // Pre-pass: compile all effects to accumulate config variables
    let rule_outputs = compile_rules(&joker.rules, &mut ctx);

    // Build the SMODS.Joker table
    let joker_table = build_joker_table(joker, &ctx, &rule_outputs);

    // Wrap in SMODS.Joker{ ... }
    let smods_call = Stmt::ExprStmt(Expr::Call(
        Box::new(lua_path(&["SMODS", "Joker"])),
        vec![joker_table],
    ));

    Chunk {
        stmts: vec![
            lua_comment(format!(" {}", joker.name)),
            smods_call,
        ],
    }
}

/// Compile a single node for snippet preview.
///
/// Returns the Lua code that this specific node contributes.
pub fn compile_node_snippet(
    node_type: &str,
    params: &std::collections::HashMap<String, serde_json::Value>,
    object_type: ObjectType,
    mod_prefix: &str,
) -> String {
    let type_parts: Vec<&str> = node_type.split('.').collect();
    if type_parts.len() < 2 {
        return format!("-- unknown node type: {}", node_type);
    }

    let category = type_parts[0];
    let specific = type_parts[1];

    match category {
        "trigger" => {
            let ctx_expr = triggers::trigger_context(object_type, specific, false);
            let stmt = lua_if(ctx_expr, vec![lua_comment("... effects ...")]);
            Emitter::new().emit_stmts(&[stmt])
        }
        "condition" => {
            let condition = ConditionDef {
                condition_type: specific.to_string(),
                negate: false,
                params: convert_params(params),
            };
            match conditions::compile_condition(&condition, object_type) {
                Some(expr) => {
                    let stmt = lua_if(expr, vec![lua_comment("... effects ...")]);
                    Emitter::new().emit_stmts(&[stmt])
                }
                None => format!("-- condition '{}' not yet implemented", specific),
            }
        }
        "effect" => {
            let effect = EffectDef {
                effect_type: specific.to_string(),
                params: convert_params(params),
            };
            let mut ctx = CompileContext::new(
                object_type,
                mod_prefix.to_string(),
                "preview".to_string(),
                false,
            );
            match effects::compile_effect(&effect, &mut ctx, "hand_played") {
                Some(output) => {
                    let stmts = effects::build_return_block(&[output]);
                    Emitter::new().emit_stmts(&stmts)
                }
                None => format!("-- effect '{}' not yet implemented", specific),
            }
        }
        _ => format!("-- unknown category: {}", category),
    }
}

// ---------------------------------------------------------------------------
// Internal compilation
// ---------------------------------------------------------------------------

struct RuleOutput {
    trigger: String,
    condition_expr: Option<Expr>,
    effect_stmts: Vec<Stmt>,
    is_passive: bool,
    passive_outputs: Vec<effects::passive::PassiveEffectOutput>,
}

fn compile_rules(rules: &[RuleDef], ctx: &mut CompileContext) -> Vec<RuleOutput> {
    rules
        .iter()
        .map(|rule| compile_single_rule(rule, ctx))
        .collect()
}

fn compile_single_rule(rule: &RuleDef, ctx: &mut CompileContext) -> RuleOutput {
    let trigger = rule.trigger.clone();
    let is_passive = trigger == "passive";

    // Compile conditions
    let condition_expr = conditions::compile_condition_chain(
        &rule.condition_groups,
        ctx.object_type,
    );

    // Check for passive effects
    let mut passive_outputs = Vec::new();
    if is_passive {
        for effect in &rule.effects {
            if let Some(po) = effects::passive::compile_passive(effect, ctx) {
                passive_outputs.push(po);
            }
        }
    }

    // Compile regular effects
    let mut effect_outputs = Vec::new();
    if !is_passive {
        for effect in &rule.effects {
            if let Some(eo) = effects::compile_effect(effect, ctx, &trigger) {
                effect_outputs.push(eo);
            }
        }
    }

    // Compile random groups
    for rg in &rule.random_groups {
        let rg_effects = compile_random_group(rg, ctx, &trigger);
        effect_outputs.extend(rg_effects);
    }

    // Build the effect statements
    let effect_stmts = if effect_outputs.is_empty() {
        vec![]
    } else {
        effects::build_return_block(&effect_outputs)
    };

    RuleOutput {
        trigger,
        condition_expr,
        effect_stmts,
        is_passive,
        passive_outputs,
    }
}

fn compile_random_group(
    rg: &RandomGroupDef,
    ctx: &mut CompileContext,
    trigger: &str,
) -> Vec<effects::EffectOutput> {
    // Compile the effects within the random group
    let mut inner_outputs = Vec::new();
    for effect in &rg.effects {
        if let Some(eo) = effects::compile_effect(effect, ctx, trigger) {
            inner_outputs.push(eo);
        }
    }

    if inner_outputs.is_empty() {
        return vec![];
    }

    // Build the inner return block
    let inner_stmts = effects::build_return_block(&inner_outputs);

    // Wrap in probability check:
    // if SMODS.pseudorandom_probability(...) then <inner> end
    let odds_var = format!("odds_{}", rg.id.replace('-', "_"));
    let prob_check = lua_call(
        "SMODS.pseudorandom_probability",
        vec![
            lua_ident("card"),
            lua_str(&format!("group_{}", rg.id)),
            lua_int(1),
            lua_field(lua_raw_expr(ctx.ability_path()), &odds_var),
            lua_str(&ctx.smods_key()),
            lua_bool(false),
        ],
    );

    // Register the odds config variable
    let denom = rg.chance_denominator.as_i64().unwrap_or(2);
    ctx.add_config_int(&odds_var, denom);

    let wrapped = effects::EffectOutput {
        return_fields: vec![],
        pre_return: vec![lua_if(prob_check, inner_stmts)],
        config_vars: vec![],
        message: None,
        colour: None,
    };

    vec![wrapped]
}

fn build_joker_table(
    joker: &JokerDef,
    ctx: &CompileContext,
    rule_outputs: &[RuleOutput],
) -> Expr {
    let mut entries: Vec<TableEntry> = Vec::new();

    // Basic properties
    entries.push(kv("key", lua_str(&joker.key)));

    // Config table with extra
    let config_extra = ctx.build_config_extra_table();
    if !config_extra.is_empty() {
        entries.push(TableEntry::KeyValue(
            "config".to_string(),
            lua_table_raw(vec![TableEntry::KeyValue(
                "extra".to_string(),
                lua_table_raw(config_extra),
            )]),
        ));
    }

    // Localization
    let desc_expr = if joker.description.len() == 1 {
        lua_str(&joker.description[0])
    } else {
        lua_table_raw(
            joker
                .description
                .iter()
                .map(|d| TableEntry::Value(lua_str(d)))
                .collect(),
        )
    };

    entries.push(TableEntry::KeyValue(
        "loc_txt".to_string(),
        lua_table_raw(vec![
            TableEntry::KeyValue("name".to_string(), lua_str(&joker.name)),
            TableEntry::KeyValue("text".to_string(), desc_expr),
        ]),
    ));

    // Position
    entries.push(TableEntry::KeyValue(
        "pos".to_string(),
        lua_table(vec![("x", lua_int(joker.pos.x as i64)), ("y", lua_int(joker.pos.y as i64))]),
    ));

    // Soul position
    if let Some(soul) = &joker.soul_pos {
        entries.push(TableEntry::KeyValue(
            "soul_pos".to_string(),
            lua_table(vec![("x", lua_int(soul.x as i64)), ("y", lua_int(soul.y as i64))]),
        ));
    }

    // Display size
    if let Some(size) = &joker.display_size {
        entries.push(TableEntry::KeyValue(
            "display_size".to_string(),
            lua_table(vec![("w", lua_num(size.w)), ("h", lua_num(size.h))]),
        ));
    }

    // Scalar properties
    entries.push(kv("cost", lua_int(joker.cost as i64)));
    entries.push(kv("rarity", lua_str(&joker.rarity)));
    entries.push(kv("blueprint_compat", lua_bool(joker.blueprint_compat)));
    entries.push(kv("eternal_compat", lua_bool(joker.eternal_compat)));
    entries.push(kv("perishable_compat", lua_bool(joker.perishable_compat)));
    entries.push(kv("unlocked", lua_bool(joker.unlocked)));
    entries.push(kv("discovered", lua_bool(joker.discovered)));
    entries.push(kv("atlas", lua_str(&joker.atlas)));

    // In-pool function
    if let Some(appearance) = &joker.appearance {
        if let Some(pool_fn) = build_in_pool(appearance, ctx) {
            entries.push(TableEntry::KeyValue("in_pool".to_string(), pool_fn));
        }
    }

    // Loc vars function
    let loc_vars_fn = build_loc_vars(ctx);
    if let Some(f) = loc_vars_fn {
        entries.push(TableEntry::KeyValue("loc_vars".to_string(), f));
    }

    // Passive effect functions
    let (add_deck, remove_deck) = build_passive_functions(rule_outputs);
    if let Some(f) = add_deck {
        entries.push(TableEntry::KeyValue("add_to_deck".to_string(), f));
    }
    if let Some(f) = remove_deck {
        entries.push(TableEntry::KeyValue("remove_from_deck".to_string(), f));
    }

    // Calculate function
    let calc_fn = build_calculate_function(rule_outputs, ctx);
    if let Some(f) = calc_fn {
        entries.push(TableEntry::KeyValue("calculate".to_string(), f));
    }

    lua_table_raw(entries)
}

/// Build the `calculate` function from non-passive rules.
fn build_calculate_function(
    rule_outputs: &[RuleOutput],
    ctx: &CompileContext,
) -> Option<Expr> {
    let non_passive: Vec<&RuleOutput> = rule_outputs
        .iter()
        .filter(|r| !r.is_passive && !r.effect_stmts.is_empty())
        .collect();

    if non_passive.is_empty() {
        return None;
    }

    // Group rules by trigger
    let mut body: Vec<Stmt> = Vec::new();

    // Also include passive calculate statements
    for ro in rule_outputs {
        if ro.is_passive {
            for po in &ro.passive_outputs {
                body.extend(po.calculate_stmts.clone());
            }
        }
    }

    // Group non-passive rules by trigger type
    let mut triggers_seen: Vec<String> = Vec::new();
    for ro in &non_passive {
        if !triggers_seen.contains(&ro.trigger) {
            triggers_seen.push(ro.trigger.clone());
        }
    }

    for trigger in &triggers_seen {
        let rules_for_trigger: Vec<&&RuleOutput> = non_passive
            .iter()
            .filter(|r| r.trigger == *trigger)
            .collect();

        // Get the trigger context expression
        let trigger_ctx = triggers::trigger_context(
            ctx.object_type,
            trigger,
            ctx.blueprint_compat,
        );

        let mut trigger_body: Vec<Stmt> = Vec::new();

        for ro in &rules_for_trigger {
            if let Some(cond) = &ro.condition_expr {
                // Wrap effects in condition check
                trigger_body.push(lua_if(cond.clone(), ro.effect_stmts.clone()));
            } else {
                // No conditions — effects execute directly
                trigger_body.extend(ro.effect_stmts.clone());
            }
        }

        if !trigger_body.is_empty() {
            body.push(lua_if(trigger_ctx, trigger_body));
        }
    }

    if body.is_empty() {
        return None;
    }

    Some(Expr::Function {
        params: vec!["self".into(), "card".into(), "context".into()],
        body,
    })
}

/// Build `add_to_deck` and `remove_from_deck` from passive effects.
fn build_passive_functions(
    rule_outputs: &[RuleOutput],
) -> (Option<Expr>, Option<Expr>) {
    let mut add_stmts: Vec<Stmt> = Vec::new();
    let mut remove_stmts: Vec<Stmt> = Vec::new();

    for ro in rule_outputs {
        if ro.is_passive {
            for po in &ro.passive_outputs {
                add_stmts.extend(po.add_to_deck.clone());
                remove_stmts.extend(po.remove_from_deck.clone());
            }
        }
    }

    let add_fn = if add_stmts.is_empty() {
        None
    } else {
        Some(Expr::Function {
            params: vec!["self".into(), "card".into(), "from_debuff".into()],
            body: add_stmts,
        })
    };

    let remove_fn = if remove_stmts.is_empty() {
        None
    } else {
        Some(Expr::Function {
            params: vec!["self".into(), "card".into(), "from_debuff".into()],
            body: remove_stmts,
        })
    };

    (add_fn, remove_fn)
}

/// Build the `loc_vars` function for localization variables.
fn build_loc_vars(ctx: &CompileContext) -> Option<Expr> {
    let vars = ctx.config_vars();
    if vars.is_empty() {
        return None;
    }

    // Return { vars = { var1, var2, ... } }
    let var_refs: Vec<TableEntry> = vars
        .iter()
        .map(|v| TableEntry::Value(lua_field(
            lua_raw_expr("self.config.extra"),
            &v.name,
        )))
        .collect();

    let body = vec![lua_return(lua_table_raw(vec![
        TableEntry::KeyValue("vars".to_string(), lua_table_raw(var_refs)),
    ]))];

    Some(Expr::Function {
        params: vec!["self".into(), "info_queue".into()],
        body,
    })
}

/// Build the `in_pool` function for appearance restrictions.
fn build_in_pool(appearance: &AppearanceDef, _ctx: &CompileContext) -> Option<Expr> {
    if appearance.appears_in.is_empty()
        && appearance.not_appears_in.is_empty()
        && appearance.appear_flags.is_empty()
    {
        return None;
    }

    let mut conditions: Vec<Expr> = Vec::new();

    // Not appears in checks
    for pool in &appearance.not_appears_in {
        conditions.push(lua_not(lua_eq(
            lua_field(lua_ident("args"), "type"),
            lua_str(pool),
        )));
    }

    // Appears in checks
    if !appearance.appears_in.is_empty() {
        let appear_checks: Vec<Expr> = appearance
            .appears_in
            .iter()
            .map(|pool| lua_eq(lua_field(lua_ident("args"), "type"), lua_str(pool)))
            .collect();
        conditions.push(lua_or_chain(appear_checks));
    }

    let cond = if conditions.is_empty() {
        lua_bool(true)
    } else {
        lua_and_chain(conditions)
    };

    let body = vec![lua_return(cond)];

    Some(Expr::Function {
        params: vec!["self".into(), "args".into()],
        body,
    })
}

/// Helper to create a key-value table entry.
fn kv(key: &str, val: Expr) -> TableEntry {
    TableEntry::KeyValue(key.to_string(), val)
}

/// Convert serde_json Value params to ParamValue params.
fn convert_params(
    params: &std::collections::HashMap<String, serde_json::Value>,
) -> std::collections::HashMap<String, ParamValue> {
    params
        .iter()
        .map(|(k, v)| {
            let pv = match v {
                serde_json::Value::Number(n) => {
                    if let Some(i) = n.as_i64() {
                        ParamValue::Int(i)
                    } else {
                        ParamValue::Float(n.as_f64().unwrap_or(0.0))
                    }
                }
                serde_json::Value::Bool(b) => ParamValue::Bool(*b),
                serde_json::Value::String(s) => ParamValue::Str(s.clone()),
                _ => ParamValue::Str(v.to_string()),
            };
            (k.clone(), pv)
        })
        .collect()
}
