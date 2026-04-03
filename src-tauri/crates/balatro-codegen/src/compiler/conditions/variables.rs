use crate::compiler::values::comparison_op;
use crate::lua_ast::*;
use crate::types::ConditionDef;

fn get_param<'a>(
    condition: &'a ConditionDef,
    keys: &[&str],
) -> Option<&'a crate::types::ParamValue> {
    for key in keys {
        if let Some(value) = condition.params.get(*key) {
            return Some(value);
        }
    }
    None
}

pub fn internal_variable(condition: &ConditionDef) -> Option<Expr> {
    let variable_name = get_param(condition, &["variable_name", "variableName", "variable"])
        .and_then(|v| v.as_str())
        .unwrap_or("var1");
    let operator = get_param(condition, &["operator", "op"])
        .and_then(|v| v.as_str())
        .unwrap_or("equals");
    let rhs = get_param(condition, &["value"])
        .map(|v| lua_raw_expr(&v.to_string_lossy()))
        .unwrap_or_else(|| lua_int(0));

    Some(comparison_op(
        operator,
        lua_field(lua_raw_expr("card.ability.extra"), variable_name),
        rhs,
    ))
}

pub fn key_variable(condition: &ConditionDef) -> Option<Expr> {
    let variable_name = get_param(condition, &["variable_name", "variableName", "variable"])
        .and_then(|v| v.as_str())
        .unwrap_or("keyvar");
    let specific_key = get_param(condition, &["specific_key", "key", "value"])
        .map(|v| v.to_string_lossy())
        .unwrap_or_else(|| "none".to_string());

    Some(lua_eq(
        lua_field(lua_raw_expr("card.ability.extra"), variable_name),
        lua_str(specific_key),
    ))
}

pub fn text_variable(condition: &ConditionDef) -> Option<Expr> {
    let variable_name = get_param(condition, &["variable_name", "variableName", "variable"])
        .and_then(|v| v.as_str())
        .unwrap_or("textvar");
    let text = get_param(condition, &["text", "value"])
        .map(|v| v.to_string_lossy())
        .unwrap_or_default();

    Some(lua_eq(
        lua_field(lua_raw_expr("card.ability.extra"), variable_name),
        lua_str(text),
    ))
}

pub fn poker_hand_variable(condition: &ConditionDef) -> Option<Expr> {
    let variable_name = get_param(condition, &["variable_name", "variableName", "variable"])
        .and_then(|v| v.as_str())
        .unwrap_or("handvar");
    let hand_name = get_param(condition, &["poker_hand", "hand", "value"])
        .map(|v| v.to_string_lossy())
        .unwrap_or_default();

    Some(lua_eq(
        lua_field(lua_raw_expr("card.ability.extra"), variable_name),
        lua_str(hand_name),
    ))
}

pub fn rank_variable(condition: &ConditionDef) -> Option<Expr> {
    let variable_name = get_param(condition, &["variable_name", "variableName", "variable"])
        .and_then(|v| v.as_str())
        .unwrap_or("rankvar");
    let rank = get_param(condition, &["rank", "value"])
        .map(|v| v.to_string_lossy())
        .unwrap_or_default();

    Some(lua_eq(
        lua_field(lua_raw_expr("card.ability.extra"), variable_name),
        lua_str(rank),
    ))
}

pub fn suit_variable(condition: &ConditionDef) -> Option<Expr> {
    let variable_name = get_param(condition, &["variable_name", "variableName", "variable"])
        .and_then(|v| v.as_str())
        .unwrap_or("suitvar");
    let suit = get_param(condition, &["suit", "value"])
        .map(|v| v.to_string_lossy())
        .unwrap_or_default();

    Some(lua_eq(
        lua_field(lua_raw_expr("card.ability.extra"), variable_name),
        lua_str(suit),
    ))
}
