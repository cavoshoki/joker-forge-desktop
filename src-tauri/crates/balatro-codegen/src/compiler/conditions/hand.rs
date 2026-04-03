use crate::compiler::values::comparison_op;
use crate::lua_ast::*;
use crate::types::ConditionDef;

/// Hand Type condition — checks if the scoring hand matches a poker hand.
pub fn hand_type(condition: &ConditionDef) -> Option<Expr> {
    let hand = condition.params.get("handType")?.as_str()?;
    let scope = condition
        .params
        .get("scope")
        .and_then(|v| v.as_str())
        .unwrap_or("scoring");

    match hand {
        "most_played_hand" => {
            // IIFE that checks if the scoring hand is the most played
            Some(lua_raw_expr(
                "(function() \
                    local current_played = G.GAME.hands[context.scoring_name].played or 0; \
                    for handname, values in pairs(G.GAME.hands) do \
                        if handname ~= context.scoring_name and values.played > current_played and values.visible then \
                            return false \
                        end \
                    end; \
                    return true \
                end)()",
            ))
        }
        "least_played_hand" => {
            Some(lua_raw_expr(
                "(function() \
                    local current_played = G.GAME.hands[context.scoring_name].played or 0; \
                    for handname, values in pairs(G.GAME.hands) do \
                        if handname ~= context.scoring_name and values.played < current_played and values.visible then \
                            return false \
                        end \
                    end; \
                    return true \
                end)()",
            ))
        }
        _ => {
            let hand_ref = lua_str(hand);

            match scope {
                "scoring" => {
                    // context.scoring_name == 'hand'
                    Some(lua_eq(lua_path(&["context", "scoring_name"]), hand_ref))
                }
                "all_played" | "contains" => {
                    // next(context.poker_hands['hand'])
                    Some(lua_call(
                        "next",
                        vec![lua_index(
                            lua_path(&["context", "poker_hands"]),
                            hand_ref,
                        )],
                    ))
                }
                _ => {
                    Some(lua_eq(lua_path(&["context", "scoring_name"]), hand_ref))
                }
            }
        }
    }
}

/// Hand Count condition — checks the number of cards in the current hand.
pub fn hand_count(condition: &ConditionDef) -> Option<Expr> {
    let operator = condition
        .params
        .get("operator")
        .and_then(|v| v.as_str())
        .unwrap_or("equals");
    let value = condition.params.get("value")?.as_i64()?;

    Some(comparison_op(
        operator,
        lua_len(lua_path(&["G", "hand", "cards"])),
        lua_int(value),
    ))
}

/// Hand Size condition — checks the hand size limit.
pub fn hand_size(condition: &ConditionDef) -> Option<Expr> {
    let operator = condition
        .params
        .get("operator")
        .and_then(|v| v.as_str())
        .unwrap_or("equals");
    let value = condition.params.get("value")?.as_i64()?;

    Some(comparison_op(
        operator,
        lua_path(&["G", "hand", "config", "card_limit"]),
        lua_int(value),
    ))
}

/// Suit Count condition — number of cards of a specific suit in the scoring hand.
pub fn suit_count(condition: &ConditionDef) -> Option<Expr> {
    let suit = condition.params.get("suit")?.as_str()?;
    let operator = condition
        .params
        .get("operator")
        .and_then(|v| v.as_str())
        .unwrap_or("greater_than");
    let value = condition.params.get("value")?.as_i64()?;

    // Count cards with matching suit in scoring hand
    let count_expr = lua_raw_expr(&format!(
        "(function() local c = 0; for _, v in ipairs(context.scoring_hand or {{}}) do \
         if v:is_suit('{}') then c = c + 1 end end return c end)()",
        suit
    ));

    Some(comparison_op(operator, count_expr, lua_int(value)))
}

/// Rank Count condition — number of cards of a specific rank in the scoring hand.
pub fn rank_count(condition: &ConditionDef) -> Option<Expr> {
    let rank = condition.params.get("rank")?.as_str()?;
    let operator = condition
        .params
        .get("operator")
        .and_then(|v| v.as_str())
        .unwrap_or("greater_than");
    let value = condition.params.get("value")?.as_i64()?;

    let rank_id = rank_to_id(rank);
    let count_expr = lua_raw_expr(&format!(
        "(function() local c = 0; for _, v in ipairs(context.scoring_hand or {{}}) do \
         if v:get_id() == {} then c = c + 1 end end return c end)()",
        rank_id
    ));

    Some(comparison_op(operator, count_expr, lua_int(value)))
}

/// Hand Level condition — checks the level of the scoring hand.
pub fn hand_level(condition: &ConditionDef) -> Option<Expr> {
    let operator = condition
        .params
        .get("operator")
        .and_then(|v| v.as_str())
        .unwrap_or("greater_than");
    let value = condition.params.get("value")?.as_i64()?;

    Some(comparison_op(
        operator,
        lua_path(&["G", "GAME", "hands[context.scoring_name]", "level"]),
        lua_int(value),
    ))
}

/// Convert rank name to Balatro's numeric ID.
fn rank_to_id(rank: &str) -> &str {
    match rank {
        "Ace" => "14",
        "King" => "13",
        "Queen" => "12",
        "Jack" => "11",
        "10" => "10",
        "9" => "9",
        "8" => "8",
        "7" => "7",
        "6" => "6",
        "5" => "5",
        "4" => "4",
        "3" => "3",
        "2" => "2",
        _ => rank,
    }
}
