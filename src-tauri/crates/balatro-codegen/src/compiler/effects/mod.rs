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
        "create_playing_card" => creation::create_playing_card(effect, ctx),
        "create_playing_cards" => creation::create_playing_cards(effect, ctx),
        "create_tag" => creation::create_tag(effect, ctx),

        // Destruction effects
        "destroy_card" => destruction::destroy_card(effect, ctx, trigger),
        "destroy_joker" => destruction::destroy_joker(effect, ctx),
        "destroy_consumable" => destruction::destroy_consumable(effect, ctx),
        "destroy_cards" => destruction::destroy_cards(effect, ctx),

        // Economy
        "set_dollars" => misc::set_dollars(effect, ctx),
        "set_sell_value" => misc::set_sell_value(effect, ctx),

        // Retrigger
        "retrigger" => misc::retrigger(effect, ctx),

        // Display
        "show_message" => misc::show_message(effect, ctx),
        "play_sound" => misc::play_sound(effect, ctx),
        "juice_up_joker" => misc::juice_up_joker(effect, ctx),

        // Game state
        "level_up_hand" => misc::level_up_hand(effect, ctx),
        "edit_blind_size" => misc::edit_blind_size(effect, ctx),
        "set_ante" => misc::set_ante(effect, ctx),
        "disable_boss_blind" => misc::disable_boss_blind(effect, ctx),
        "force_game_over" => misc::force_game_over(effect, ctx),
        "win_game" => misc::win_game(effect, ctx),
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
        let table = lua_table_raw(return_entries);
        stmts.push(lua_return(table));
    }

    stmts
}
