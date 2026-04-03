use crate::compiler::context::CompileContext;
use crate::lua_ast::*;
use crate::types::EffectDef;

/// Result of compiling a passive effect.
/// Passive effects don't go through the normal trigger→condition→effect flow;
/// they produce code for `add_to_deck`, `remove_from_deck`, or special
/// calculate blocks.
#[derive(Debug, Default)]
pub struct PassiveEffectOutput {
    pub add_to_deck: Vec<Stmt>,
    pub remove_from_deck: Vec<Stmt>,
    pub calculate_stmts: Vec<Stmt>,
    pub config_vars: Vec<(String, crate::types::ConfigValue)>,
    pub loc_vars: Vec<String>,
}

/// Splash — all played cards count as scored.
pub fn splash(_effect: &EffectDef, _ctx: &CompileContext) -> PassiveEffectOutput {
    // In calculate():
    // if context.modify_scoring_hand and not context.blueprint then
    //     return { add_to_hand = true }
    // end
    let check = lua_if(
        lua_and(
            lua_path(&["context", "modify_scoring_hand"]),
            lua_not(lua_path(&["context", "blueprint"])),
        ),
        vec![lua_return(lua_table(vec![("add_to_hand", lua_bool(true))]))],
    );

    PassiveEffectOutput {
        calculate_stmts: vec![check],
        ..Default::default()
    }
}

/// Free rerolls — sets reroll cost to 0 while joker is held.
pub fn free_rerolls(_effect: &EffectDef, _ctx: &CompileContext) -> PassiveEffectOutput {
    // add_to_deck: G.GAME.round_resets.reroll_cost = 0
    // remove_from_deck: G.GAME.round_resets.reroll_cost = 5
    let add = lua_assign(
        lua_path(&["G", "GAME", "round_resets", "reroll_cost"]),
        lua_int(0),
    );
    let remove = lua_assign(
        lua_path(&["G", "GAME", "round_resets", "reroll_cost"]),
        lua_int(5),
    );

    PassiveEffectOutput {
        add_to_deck: vec![add],
        remove_from_deck: vec![remove],
        ..Default::default()
    }
}

/// Allow debt — lets player go into negative money.
pub fn allow_debt(effect: &EffectDef, _ctx: &CompileContext) -> PassiveEffectOutput {
    let amount = effect
        .params
        .get("amount")
        .and_then(|v| v.as_i64())
        .unwrap_or(50);

    let add = lua_assign(
        lua_path(&["G", "GAME", "bankrupt_at"]),
        lua_raw_expr(&format!("G.GAME.bankrupt_at - {}", amount)),
    );
    let remove = lua_assign(
        lua_path(&["G", "GAME", "bankrupt_at"]),
        lua_raw_expr(&format!("G.GAME.bankrupt_at + {}", amount)),
    );

    PassiveEffectOutput {
        add_to_deck: vec![add],
        remove_from_deck: vec![remove],
        ..Default::default()
    }
}

/// Dispatch a passive effect by type.
pub fn compile_passive(
    effect: &EffectDef,
    ctx: &CompileContext,
) -> Option<PassiveEffectOutput> {
    match effect.effect_type.as_str() {
        "splash" => Some(splash(effect, ctx)),
        "free_rerolls" => Some(free_rerolls(effect, ctx)),
        "allow_debt" => Some(allow_debt(effect, ctx)),
        _ => None,
    }
}
