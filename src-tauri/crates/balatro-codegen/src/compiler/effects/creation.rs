use crate::compiler::context::CompileContext;
use crate::compiler::effects::EffectOutput;
use crate::lua_ast::*;
use crate::types::EffectDef;

/// Create Joker effect — spawns a joker card.
///
/// This is one of the more complex effects: it needs pre-return code for
/// the event manager, handles slot limits, editions, and stickers.
pub fn create_joker(effect: &EffectDef, _ctx: &mut CompileContext) -> EffectOutput {
    let joker_type = get_str_param(effect, "jokerType").unwrap_or("random");
    let edition = get_str_param(effect, "edition");
    let sticker = get_str_param(effect, "sticker");
    let ignore_slots = get_bool_param(effect, "ignoreSlots");

    // Build the SMODS.add_card arguments
    let mut add_card_entries = vec![TableEntry::KeyValue("set".to_string(), lua_str("Joker"))];

    match joker_type {
        "specific" => {
            if let Some(key) = get_str_param(effect, "jokerKey") {
                let key = normalize_joker_key(key);
                add_card_entries.push(TableEntry::KeyValue("key".to_string(), lua_str(key)));
            }
        }
        "pool" => {
            if let Some(pool) = get_str_param(effect, "pool") {
                add_card_entries.push(TableEntry::KeyValue("set".to_string(), lua_str(pool)));
            }
        }
        "common" | "uncommon" | "rare" | "legendary" => {
            add_card_entries.push(TableEntry::KeyValue(
                "rarity".to_string(),
                lua_str(joker_type),
            ));
        }
        _ => {} // "random" — no extra params
    }

    // Build the event body
    let mut event_body: Vec<Stmt> = Vec::new();

    // Slot limit check
    let has_slot_check = !ignore_slots;
    if has_slot_check {
        // local created_joker = false
        // if #G.jokers.cards + G.GAME.joker_buffer < G.jokers.config.card_limit then
        //     created_joker = true
        //     G.GAME.joker_buffer = G.GAME.joker_buffer + 1
    }

    // The actual card creation
    let add_card_call = Expr::Call(
        Box::new(lua_path(&["SMODS", "add_card"])),
        vec![lua_table_raw(add_card_entries)],
    );

    let mut inner_body: Vec<Stmt> = Vec::new();
    inner_body.push(lua_local("joker_card", add_card_call));

    // Edition application
    if let Some(ed) = edition {
        if !ed.is_empty() && ed != "none" {
            inner_body.push(lua_if(
                lua_ident("joker_card"),
                vec![lua_expr_stmt(lua_method(
                    lua_ident("joker_card"),
                    "set_edition",
                    vec![lua_str(ed), lua_bool(true)],
                ))],
            ));
        }
    }

    // Sticker application
    if let Some(st) = sticker {
        if !st.is_empty() && st != "none" {
            inner_body.push(lua_if(
                lua_ident("joker_card"),
                vec![lua_expr_stmt(lua_method(
                    lua_ident("joker_card"),
                    "add_sticker",
                    vec![lua_str(st), lua_bool(true)],
                ))],
            ));
        }
    }

    if has_slot_check {
        // Wrap in slot limit check
        event_body.push(lua_local("created_joker", lua_bool(false)));
        event_body.push(lua_if(
            lua_lt(
                lua_add(
                    lua_len(lua_path(&["G", "jokers", "cards"])),
                    lua_path(&["G", "GAME", "joker_buffer"]),
                ),
                lua_path(&["G", "jokers", "config", "card_limit"]),
            ),
            {
                let mut slot_body = vec![
                    lua_assign(lua_ident("created_joker"), lua_bool(true)),
                    lua_assign(
                        lua_path(&["G", "GAME", "joker_buffer"]),
                        lua_add(lua_path(&["G", "GAME", "joker_buffer"]), lua_int(1)),
                    ),
                ];
                slot_body.extend(inner_body);
                // Reset buffer
                slot_body.push(lua_assign(
                    lua_path(&["G", "GAME", "joker_buffer"]),
                    lua_sub(lua_path(&["G", "GAME", "joker_buffer"]), lua_int(1)),
                ));
                slot_body
            },
        ));
    } else {
        event_body.extend(inner_body);
    }

    event_body.push(lua_return(lua_bool(true)));

    // Wrap in G.E_MANAGER:add_event(Event({...}))
    let event_func = Expr::Function {
        params: vec![],
        body: event_body,
    };

    let event_call = lua_expr_stmt(lua_method(
        lua_path(&["G", "E_MANAGER"]),
        "add_event",
        vec![lua_call(
            "Event",
            vec![lua_table_raw(vec![TableEntry::KeyValue(
                "func".to_string(),
                event_func,
            )])],
        )],
    ));

    // Message for the return
    let message = if has_slot_check {
        Some(lua_and(
            lua_ident("created_joker"),
            lua_call("localize", vec![lua_str("k_plus_joker")]),
        ))
    } else {
        Some(lua_call("localize", vec![lua_str("k_plus_joker")]))
    };

    EffectOutput {
        return_fields: vec![],
        pre_return: vec![event_call],
        config_vars: vec![],
        message,
        colour: Some(lua_raw_expr("G.C.GREEN")),
    }
}

/// Create Consumable effect — spawns a consumable card.
pub fn create_consumable(effect: &EffectDef, _ctx: &mut CompileContext) -> EffectOutput {
    let consumable_type = get_str_param(effect, "consumableType").unwrap_or("Tarot");
    let specific_key = get_str_param(effect, "consumableKey");

    let mut add_card_entries = vec![TableEntry::KeyValue(
        "set".to_string(),
        lua_str(consumable_type),
    )];

    if let Some(key) = specific_key {
        add_card_entries.push(TableEntry::KeyValue("key".to_string(), lua_str(key)));
    }

    let add_card_call = Expr::Call(
        Box::new(lua_path(&["SMODS", "add_card"])),
        vec![lua_table_raw(add_card_entries)],
    );

    // Slot check for consumables
    let slot_check_body = vec![lua_expr_stmt(add_card_call)];

    let slot_check = lua_if(
        lua_lt(
            lua_len(lua_path(&["G", "consumeables", "cards"])),
            lua_path(&["G", "consumeables", "config", "card_limit"]),
        ),
        slot_check_body,
    );

    EffectOutput {
        return_fields: vec![],
        pre_return: vec![slot_check],
        config_vars: vec![],
        message: Some(lua_call("localize", vec![lua_str("k_plus_tarot")])),
        colour: Some(lua_raw_expr("G.C.SECONDARY_SET.Tarot")),
    }
}

/// Create Playing Card effect — adds a single base playing card.
pub fn create_playing_card(effect: &EffectDef, _ctx: &mut CompileContext) -> EffectOutput {
    let target = get_str_param(effect, "location").unwrap_or("deck");
    let message = get_str_param(effect, "customMessage").unwrap_or("Added Card!");

    let pre = if target == "hand" {
        vec![lua_raw_stmt(
            "local c = SMODS.add_card({ set = 'Base' }); if c and G.hand then G.hand:emplace(c) end",
        )]
    } else {
        vec![lua_raw_stmt("SMODS.add_card({ set = 'Base' })")]
    };

    EffectOutput {
        return_fields: vec![],
        pre_return: pre,
        config_vars: vec![],
        message: Some(lua_str(message)),
        colour: Some(lua_raw_expr("G.C.GREEN")),
    }
}

/// Create Playing Cards effect — adds multiple base playing cards.
pub fn create_playing_cards(effect: &EffectDef, _ctx: &mut CompileContext) -> EffectOutput {
    let count = effect
        .params
        .get("count")
        .and_then(|v| v.as_i64())
        .unwrap_or(1)
        .max(1);

    let pre = vec![lua_raw_stmt(format!(
        "for _ = 1, {} do SMODS.add_card({{ set = 'Base' }}) end",
        count
    ))];

    EffectOutput {
        return_fields: vec![],
        pre_return: pre,
        config_vars: vec![],
        message: Some(lua_str("Added Cards!")),
        colour: Some(lua_raw_expr("G.C.GREEN")),
    }
}

/// Create Tag effect — creates a random or specific tag.
pub fn create_tag(effect: &EffectDef, _ctx: &mut CompileContext) -> EffectOutput {
    let mode = get_str_param(effect, "tag_type").unwrap_or("random");
    let specific = get_str_param(effect, "specific_tag").unwrap_or("tag_double");

    let stmt = if mode == "random" {
        lua_raw_stmt(
            "local selected_tag = pseudorandom_element(G.P_TAGS, pseudoseed('create_tag')).key; local tag = Tag(selected_tag); tag:set_ability(); add_tag(tag)",
        )
    } else {
        lua_raw_stmt(format!(
            "local tag = Tag('{}'); tag:set_ability(); add_tag(tag)",
            specific
        ))
    };

    EffectOutput {
        return_fields: vec![],
        pre_return: vec![stmt],
        config_vars: vec![],
        message: Some(lua_str("Created Tag!")),
        colour: Some(lua_raw_expr("G.C.GREEN")),
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn get_str_param<'a>(effect: &'a EffectDef, key: &str) -> Option<&'a str> {
    effect.params.get(key).and_then(|v| v.as_str())
}

fn get_bool_param(effect: &EffectDef, key: &str) -> bool {
    effect
        .params
        .get(key)
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

fn normalize_joker_key(key: &str) -> String {
    if key.starts_with("j_") {
        key.to_string()
    } else {
        format!("j_{}", key)
    }
}
