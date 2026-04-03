use crate::compiler::context::CompileContext;
use crate::compiler::effects::EffectOutput;
use crate::lua_ast::*;
use crate::types::EffectDef;

/// Destroy Card effect — marks a card for destruction.
///
/// Behaviour varies by trigger:
/// - `card_discarded`: uses `remove = true` return field
/// - Other triggers: uses pre-return code to set `card.should_destroy`
pub fn destroy_card(effect: &EffectDef, _ctx: &mut CompileContext, trigger: &str) -> EffectOutput {
    let message = effect
        .params
        .get("customMessage")
        .and_then(|v| v.as_str())
        .unwrap_or("Destroyed!");

    match trigger {
        "card_discarded" => {
            EffectOutput {
                return_fields: vec![("remove".to_string(), lua_bool(true))],
                pre_return: vec![],
                config_vars: vec![],
                message: Some(lua_str(message)),
                colour: Some(lua_raw_expr("G.C.RED")),
            }
        }
        _ => {
            let mut pre = vec![];
            // Check if glass trigger flag is needed
            let set_glass = effect
                .params
                .get("setGlassTrigger")
                .and_then(|v| v.as_bool())
                .unwrap_or(true);

            if set_glass {
                pre.push(lua_assign(
                    lua_path(&["context", "other_card", "glass_trigger"]),
                    lua_bool(true),
                ));
            }
            pre.push(lua_assign(
                lua_path(&["context", "other_card", "should_destroy"]),
                lua_bool(true),
            ));

            EffectOutput {
                return_fields: vec![],
                pre_return: pre,
                config_vars: vec![],
                message: Some(lua_str(message)),
                colour: Some(lua_raw_expr("G.C.RED")),
            }
        }
    }
}

/// Destroy Joker effect — destroys a specific joker.
pub fn destroy_joker(effect: &EffectDef, _ctx: &mut CompileContext) -> EffectOutput {
    let target = effect
        .params
        .get("target")
        .and_then(|v| v.as_str())
        .unwrap_or("self");

    let destroy_target = match target {
        "self" => lua_ident("card"),
        "random" => lua_raw_expr("G.jokers.cards[pseudorandom_element(G.jokers.cards)]"),
        _ => lua_ident("card"),
    };

    let destroy_call = lua_expr_stmt(lua_method(
        destroy_target,
        "start_dissolve",
        vec![],
    ));

    let event_body = vec![
        destroy_call,
        lua_return(lua_bool(true)),
    ];

    let event = lua_expr_stmt(lua_method(
        lua_path(&["G", "E_MANAGER"]),
        "add_event",
        vec![lua_call("Event", vec![lua_table_raw(vec![
            TableEntry::KeyValue("func".to_string(), Expr::Function {
                params: vec![],
                body: event_body,
            }),
        ])])],
    ));

    EffectOutput {
        return_fields: vec![],
        pre_return: vec![event],
        config_vars: vec![],
        message: Some(lua_str("Destroyed!")),
        colour: Some(lua_raw_expr("G.C.RED")),
    }
}
