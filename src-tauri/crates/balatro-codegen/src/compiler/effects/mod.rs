pub mod scoring;
pub mod creation;
pub mod destruction;
pub mod passive;
pub mod misc;

use crate::compiler::context::CompileContext;
use crate::lua_ast::*;
use crate::types::EffectDef;

/// The output of compiling a single effect.
#[derive(Debug, Default)]
pub struct EffectOutput {
    /// Key-value pairs to include in the `return { ... }` table.
    /// e.g., `[("chips", Expr::Int(50))]`
    pub return_fields: Vec<(String, Expr)>,

    /// Statements to execute before the return statement.
    /// Used for event queuing, card creation, variable mutation, etc.
    pub pre_return: Vec<Stmt>,

    /// Config variables to register (already tracked via CompileContext,
    /// but can be used for additional effect-local vars).
    pub config_vars: Vec<crate::types::ConfigVar>,

    /// Optional message expression for the effect.
    pub message: Option<Expr>,

    /// Optional colour expression (e.g., `G.C.CHIPS`).
    pub colour: Option<Expr>,
}

/// Compile a single effect into its Lua AST representation.
///
/// Returns `None` for unknown/unimplemented effect types.
pub fn compile_effect(
    effect: &EffectDef,
    ctx: &mut CompileContext,
    trigger: &str,
) -> Option<EffectOutput> {
    let result = match effect.effect_type.as_str() {
        // Scoring effects
        "add_chips" => scoring::add_chips(effect, ctx),
        "add_mult" => scoring::add_mult(effect, ctx),
        "apply_x_mult" => scoring::apply_x_mult(effect, ctx),
        "apply_x_chips" => scoring::apply_x_chips(effect, ctx),
        "apply_exp_chips" => scoring::apply_exp_chips(effect, ctx),
        "apply_exp_mult" => scoring::apply_exp_mult(effect, ctx),
        "apply_hyper_chips" => scoring::apply_hyper_chips(effect, ctx),
        "apply_hyper_mult" => scoring::apply_hyper_mult(effect, ctx),

        // Creation effects
        "create_joker" => creation::create_joker(effect, ctx),
        "create_consumable" | "add_consumable" => creation::create_consumable(effect, ctx),

        // Destruction effects
        "destroy_card" => destruction::destroy_card(effect, ctx, trigger),
        "destroy_joker" => destruction::destroy_joker(effect, ctx),

        // Economy
        "set_dollars" => misc::set_dollars(effect, ctx),

        // Retrigger
        "retrigger" => misc::retrigger(effect, ctx),

        // Display
        "show_message" => misc::show_message(effect, ctx),
        "play_sound" => misc::play_sound(effect, ctx),
        "juice_up_joker" => misc::juice_up_joker(effect, ctx),

        // Game state
        "level_up_hand" => misc::level_up_hand(effect, ctx),
        "edit_blind_size" => misc::edit_blind_size(effect, ctx),

        // TODO: Implement remaining effects. Each follows the same pattern:
        // parse params → build AST nodes → return EffectOutput.
        //
        // Card modification:
        // "edit_card" | "edit_card_appearance"
        // "add_card_enhancement" | "add_card_seal" | "add_card_edition"
        // "convert_to_rank" | "convert_to_suit"
        //
        // More creation:
        // "create_playing_card" | "create_playing_cards" | "create_tag"
        //
        // More destruction:
        // "destroy_consumable" | "destroy_cards"
        //
        // Economy:
        // "set_sell_value" | "reduce_price" | "earn_extra_money"
        // "edit_end_round_hand_money" | "discount_items"
        //
        // Probability:
        // "fix_probability" | "mod_probability"
        //
        // Game rules:
        // "shortcut" | "showman" | "reduce_flush_straight_requirements"
        // "combine_ranks" | "combine_suits"
        //
        // Game state:
        // "set_ante" | "disable_boss_blind" | "force_game_over"
        // "win_game" | "change_game_speed"
        //
        // Variables:
        // "modify_internal_variable" | "change_key_variable"
        // "change_text_variable" | "change_poker_hand_variable"
        // "change_rank_variable" | "change_suit_variable"
        //
        // Special:
        // "emit_flag" | "splash_effect" | "copy_joker_ability"
        _ => {
            return None;
        }
    };

    Some(result)
}

/// Build the combined return statement from multiple effect outputs.
///
/// Merges all return fields into a single table, collects pre-return code,
/// and adds SMODS.calculate_effect wrapping where needed.
pub fn build_return_block(effects: &[EffectOutput]) -> Vec<Stmt> {
    let mut stmts: Vec<Stmt> = Vec::new();

    // Collect pre-return code from all effects
    for eff in effects {
        stmts.extend(eff.pre_return.clone());
    }

    // Collect return table fields
    let mut return_entries: Vec<TableEntry> = Vec::new();
    for eff in effects {
        for (key, val) in &eff.return_fields {
            return_entries.push(TableEntry::KeyValue(key.clone(), val.clone()));
        }
        // Add message if present
        if let Some(msg) = &eff.message {
            return_entries.push(TableEntry::KeyValue("message".to_string(), msg.clone()));
        }
        // Add colour if present
        if let Some(col) = &eff.colour {
            return_entries.push(TableEntry::KeyValue("colour".to_string(), col.clone()));
        }
    }

    if !return_entries.is_empty() {
        // Use SMODS.calculate_effect for scoring returns
        let has_scoring = effects.iter().any(|e| {
            e.return_fields.iter().any(|(k, _)| {
                matches!(
                    k.as_str(),
                    "chips" | "mult" | "Xmult" | "Xchips" | "eChips" | "eMult"
                        | "hChips" | "hMult"
                )
            })
        });

        let table = lua_table_raw(return_entries);
        if has_scoring {
            stmts.push(lua_return(lua_call("SMODS.calculate_effect", vec![table, lua_ident("card")])));
        } else {
            stmts.push(lua_return(table));
        }
    }

    stmts
}
