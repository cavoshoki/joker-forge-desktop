pub mod hand;
pub mod card;
pub mod game_state;

use crate::lua_ast::*;
use crate::types::{ConditionDef, ConditionGroupDef, LogicOp, ObjectType};

/// Compile a single condition into a Lua boolean expression.
///
/// Returns `None` for unknown/unimplemented condition types.
pub fn compile_condition(
    condition: &ConditionDef,
    _object_type: ObjectType,
) -> Option<Expr> {
    let expr = match condition.condition_type.as_str() {
        // Hand conditions
        "hand_type" => hand::hand_type(condition)?,
        "hand_count" => hand::hand_count(condition)?,
        "hand_size" => hand::hand_size(condition)?,
        "suit_count" => hand::suit_count(condition)?,
        "rank_count" => hand::rank_count(condition)?,
        "hand_level" => hand::hand_level(condition)?,

        // Card conditions
        "card_rank" => card::card_rank(condition)?,
        "card_suit" => card::card_suit(condition)?,
        "card_enhancement" => card::card_enhancement(condition)?,
        "card_edition" => card::card_edition(condition)?,
        "card_seal" => card::card_seal(condition)?,

        // Game state conditions
        "ante_level" => game_state::ante_level(condition)?,
        "blind_type" => game_state::blind_type(condition)?,
        "blind_name" => game_state::blind_name(condition)?,
        "player_money" => game_state::player_money(condition)?,
        "remaining_hands" => game_state::remaining_hands(condition)?,
        "remaining_discards" => game_state::remaining_discards(condition)?,
        "joker_count" => game_state::joker_count(condition)?,
        "consumable_count" => game_state::consumable_count(condition)?,
        "deck_size" => game_state::deck_size(condition)?,

        // Generic compare
        "generic_compare" => game_state::generic_compare(condition)?,

        // TODO: Implement remaining conditions:
        //
        // Hand conditions:
        // "discarded_card_count" | "discarded_suit_count" | "discarded_rank_count"
        // "hand_enhancement_count" | "hand_edition_count" | "hand_seal_count"
        //
        // Card conditions:
        // "card_index"
        //
        // Joker conditions:
        // "specific_joker_owned" | "joker_rarity_count"
        // "joker_position" | "joker_flipped" | "joker_selected"
        // "joker_sticker" | "joker_edition"
        //
        // Consumable conditions:
        // "consumable_type"
        //
        // Deck conditions:
        // "check_deck"
        //
        // Variable conditions:
        // "internal_variable" | "key_variable" | "text_variable"
        // "poker_hand_variable" | "rank_variable" | "suit_variable"
        //
        // Probability conditions:
        // "probability_identifier" | "probability_part_compare"
        // "probability_succeeded"
        //
        // Special:
        // "poker_hand_been_played" | "glass_card_destroyed"
        // "lucky_card_triggered" | "system_condition"
        _ => {
            return None;
        }
    };

    // Apply negation
    let expr = if condition.negate {
        lua_not(expr)
    } else {
        expr
    };

    Some(expr)
}

/// Compile a full condition chain from condition groups.
///
/// Groups are ANDed together. Within each group, conditions are joined
/// by the group's logic operator (AND or OR).
pub fn compile_condition_chain(
    groups: &[ConditionGroupDef],
    object_type: ObjectType,
) -> Option<Expr> {
    if groups.is_empty() {
        return None;
    }

    let group_exprs: Vec<Expr> = groups
        .iter()
        .filter_map(|group| compile_condition_group(group, object_type))
        .collect();

    if group_exprs.is_empty() {
        return None;
    }

    Some(lua_and_chain(group_exprs))
}

/// Compile a single condition group.
fn compile_condition_group(
    group: &ConditionGroupDef,
    object_type: ObjectType,
) -> Option<Expr> {
    let cond_exprs: Vec<Expr> = group
        .conditions
        .iter()
        .filter_map(|c| compile_condition(c, object_type))
        .collect();

    if cond_exprs.is_empty() {
        return None;
    }

    let combined = match group.logic_operator {
        LogicOp::And => lua_and_chain(cond_exprs),
        LogicOp::Or => lua_or_chain(cond_exprs),
    };

    // Wrap OR groups in parens for clarity (done by the emitter's precedence logic)
    Some(combined)
}
