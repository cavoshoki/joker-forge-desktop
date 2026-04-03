use crate::compiler::values::comparison_op;
use crate::lua_ast::*;
use crate::types::ConditionDef;

/// Ante Level condition.
pub fn ante_level(condition: &ConditionDef) -> Option<Expr> {
    simple_compare(
        condition,
        lua_path(&["G", "GAME", "round_resets", "ante"]),
    )
}

/// Blind Type condition — boss, small, big.
pub fn blind_type(condition: &ConditionDef) -> Option<Expr> {
    let blind = condition.params.get("blindType")?.as_str()?;
    let lua_blind = match blind {
        "boss" => "Boss",
        "small" | "Small" => "Small",
        "big" | "Big" => "Big",
        _ => blind,
    };
    Some(lua_eq(
        lua_path(&["G", "GAME", "blind", "config", "blind", "boss", "showdown"]),
        lua_bool(lua_blind == "Boss"),
    ))
}

/// Blind Name condition — checks the specific blind name.
pub fn blind_name(condition: &ConditionDef) -> Option<Expr> {
    let name = condition.params.get("blindName")?.as_str()?;
    Some(lua_eq(
        lua_path(&["G", "GAME", "blind", "config", "blind", "key"]),
        lua_str(name),
    ))
}

/// Player Money condition.
pub fn player_money(condition: &ConditionDef) -> Option<Expr> {
    simple_compare(
        condition,
        lua_path(&["G", "GAME", "dollars"]),
    )
}

/// Remaining Hands condition.
pub fn remaining_hands(condition: &ConditionDef) -> Option<Expr> {
    simple_compare(
        condition,
        lua_path(&["G", "GAME", "current_round", "hands_left"]),
    )
}

/// Remaining Discards condition.
pub fn remaining_discards(condition: &ConditionDef) -> Option<Expr> {
    simple_compare(
        condition,
        lua_path(&["G", "GAME", "current_round", "discards_left"]),
    )
}

/// Joker Count condition.
pub fn joker_count(condition: &ConditionDef) -> Option<Expr> {
    simple_compare(
        condition,
        lua_len(lua_path(&["G", "jokers", "cards"])),
    )
}

/// Consumable Count condition.
pub fn consumable_count(condition: &ConditionDef) -> Option<Expr> {
    simple_compare(
        condition,
        lua_len(lua_path(&["G", "consumeables", "cards"])),
    )
}

/// Deck Size condition.
pub fn deck_size(condition: &ConditionDef) -> Option<Expr> {
    simple_compare(
        condition,
        lua_len(lua_path(&["G", "deck", "cards"])),
    )
}

/// Generic Compare condition — arbitrary comparison between two values.
pub fn generic_compare(condition: &ConditionDef) -> Option<Expr> {
    let value1_str = condition.params.get("value1")?.to_string_lossy();
    let operator = condition
        .params
        .get("operator")
        .and_then(|v| v.as_str())
        .unwrap_or("equals");
    let value2_str = condition.params.get("value2")?.to_string_lossy();

    let value1 = lua_raw_expr(&value1_str);
    let value2 = lua_raw_expr(&value2_str);

    Some(comparison_op(operator, value1, value2))
}

/// Helper for conditions that compare a game state expression against a value.
fn simple_compare(condition: &ConditionDef, game_expr: Expr) -> Option<Expr> {
    let operator = condition
        .params
        .get("operator")
        .and_then(|v| v.as_str())
        .unwrap_or("greater_than");
    let value = condition.params.get("value")?.as_i64()?;

    Some(comparison_op(operator, game_expr, lua_int(value)))
}
