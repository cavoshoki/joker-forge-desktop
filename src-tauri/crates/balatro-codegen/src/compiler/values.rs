use crate::lua_ast::*;
use crate::types::{ObjectType, ParamValue};

/// Parsed game variable reference.
/// Format in params: `"GAMEVAR:varId|multiplier|startsFrom"`
pub struct GameVarRef {
    pub var_id: String,
    pub multiplier: f64,
    pub starts_from: f64,
}

/// Parsed range variable reference.
/// Format in params: `"RANGE:min|max"`
pub struct RangeRef {
    pub min: f64,
    pub max: f64,
}

/// Parse a `GAMEVAR:id|mult|start` string.
pub fn parse_game_var(s: &str) -> Option<GameVarRef> {
    let rest = s.strip_prefix("GAMEVAR:")?;
    let parts: Vec<&str> = rest.split('|').collect();
    if parts.len() < 3 {
        return None;
    }
    Some(GameVarRef {
        var_id: parts[0].to_string(),
        multiplier: parts[1].parse().unwrap_or(1.0),
        starts_from: parts[2].parse().unwrap_or(0.0),
    })
}

/// Parse a `RANGE:min|max` string.
pub fn parse_range_var(s: &str) -> Option<RangeRef> {
    let rest = s.strip_prefix("RANGE:")?;
    let parts: Vec<&str> = rest.split('|').collect();
    if parts.len() < 2 {
        return None;
    }
    Some(RangeRef {
        min: parts[0].parse().unwrap_or(0.0),
        max: parts[1].parse().unwrap_or(0.0),
    })
}

/// Known game variable IDs → their Lua code expressions.
pub fn game_var_lua_code(var_id: &str) -> Option<&'static str> {
    Some(match var_id {
        "hand_size" => "#G.hand.cards",
        "joker_count" => "#G.jokers.cards",
        "remaining_hands" => "G.GAME.current_round.hands_left",
        "remaining_discards" => "G.GAME.current_round.discards_left",
        "deck_size" => "#G.deck.cards",
        "full_deck_size" => "#G.playing_cards",
        "player_money" => "G.GAME.dollars",
        "ante_level" => "G.GAME.round_resets.ante",
        "blind_chips" => "G.GAME.blind.chips",
        "blind_mult" => "G.GAME.blind.mult",
        "consumable_count" => "#G.consumeables.cards",
        "interest" => "G.GAME.interest_amount",
        "hand_level" => "G.GAME.hands[context.scoring_name].level",
        "times_hand_played" => "G.GAME.hands[context.scoring_name].played",
        "scored_card_count" => "#context.scoring_hand",
        "played_card_count" => "#context.full_hand",
        "poker_hand_count" => "(function() local c = 0; for _, v in pairs(G.GAME.hands) do if v.visible then c = c + 1 end end return c end)()",
        _ => return None,
    })
}

/// Resolve a parameter value to a Lua expression.
///
/// Handles plain numbers, strings, game variable references, range references,
/// and user variable references. When a value is a config variable (stored in
/// ability.extra), `config_var_name` provides the key to reference.
pub fn resolve_value(
    value: &ParamValue,
    object_type: ObjectType,
    config_var_name: Option<&str>,
) -> Expr {
    match value {
        ParamValue::Int(n) => {
            if let Some(name) = config_var_name {
                return ability_path_expr(object_type, name);
            }
            lua_int(*n)
        }
        ParamValue::Float(n) => {
            if let Some(name) = config_var_name {
                return ability_path_expr(object_type, name);
            }
            lua_num(*n)
        }
        ParamValue::Bool(b) => lua_bool(*b),
        ParamValue::Str(s) => resolve_string_value(s, object_type, config_var_name),
        ParamValue::Typed(typed) => {
            match typed.value_type.as_str() {
                "gameVariable" => {
                    if let Some(s) = typed.value.as_str() {
                        if let Some(gv) = parse_game_var(s) {
                            return build_game_var_expr(&gv);
                        }
                    }
                    lua_nil()
                }
                "range" => {
                    if let Some(s) = typed.value.as_str() {
                        if let Some(rv) = parse_range_var(s) {
                            return lua_call("pseudorandom", vec![
                                lua_str(s),
                                lua_num(rv.min),
                                lua_num(rv.max),
                            ]);
                        }
                    }
                    lua_nil()
                }
                "userVariable" => {
                    if let Some(name) = typed.value.as_str() {
                        return ability_path_expr(object_type, name);
                    }
                    lua_nil()
                }
                _ => {
                    // Fall through to string/number resolution
                    if let Some(n) = typed.value.as_f64() {
                        if let Some(name) = config_var_name {
                            return ability_path_expr(object_type, name);
                        }
                        if n.fract() == 0.0 {
                            lua_int(n as i64)
                        } else {
                            lua_num(n)
                        }
                    } else if let Some(s) = typed.value.as_str() {
                        resolve_string_value(s, object_type, config_var_name)
                    } else {
                        lua_nil()
                    }
                }
            }
        }
    }
}

fn resolve_string_value(s: &str, object_type: ObjectType, config_var_name: Option<&str>) -> Expr {
    // Game variable reference
    if let Some(gv) = parse_game_var(s) {
        return build_game_var_expr(&gv);
    }
    // Range variable reference
    if let Some(rv) = parse_range_var(s) {
        return lua_call("pseudorandom", vec![
            lua_str(s),
            lua_num(rv.min),
            lua_num(rv.max),
        ]);
    }
    // Try parsing as number
    if let Ok(n) = s.parse::<f64>() {
        if let Some(name) = config_var_name {
            return ability_path_expr(object_type, name);
        }
        if n.fract() == 0.0 {
            return lua_int(n as i64);
        }
        return lua_num(n);
    }
    // Plain string value
    lua_str(s)
}

/// Build the Lua expression for a game variable reference.
fn build_game_var_expr(gv: &GameVarRef) -> Expr {
    let base_code = game_var_lua_code(&gv.var_id)
        .map(|c| lua_raw_expr(c))
        .unwrap_or_else(|| lua_raw_expr(&gv.var_id));

    let with_start = if gv.starts_from != 0.0 {
        let start = if gv.starts_from.fract() == 0.0 {
            lua_int(gv.starts_from as i64)
        } else {
            lua_num(gv.starts_from)
        };
        lua_add(start, base_code)
    } else {
        base_code
    };

    if gv.multiplier != 1.0 {
        let mult = if gv.multiplier.fract() == 0.0 {
            lua_int(gv.multiplier as i64)
        } else {
            lua_num(gv.multiplier)
        };
        lua_mul(with_start, mult)
    } else {
        with_start
    }
}

/// Build a `card.ability.extra.varName` expression.
pub fn ability_path_expr(object_type: ObjectType, var_name: &str) -> Expr {
    let base = object_type.ability_path();
    lua_field(lua_raw_expr(base), var_name)
}

/// Convert a comparison operator string to the corresponding Lua binary op expression.
pub fn comparison_op(operator: &str, lhs: Expr, rhs: Expr) -> Expr {
    match operator {
        "equals" | "equal" | "==" => lua_eq(lhs, rhs),
        "not_equals" | "not_equal" | "~=" => lua_neq(lhs, rhs),
        "greater_than" | ">" => lua_gt(lhs, rhs),
        "less_than" | "<" => lua_lt(lhs, rhs),
        "greater_than_or_equal" | "greater_equals" | ">=" => lua_ge(lhs, rhs),
        "less_than_or_equal" | "less_equals" | "<=" => lua_le(lhs, rhs),
        _ => lua_eq(lhs, rhs),
    }
}
