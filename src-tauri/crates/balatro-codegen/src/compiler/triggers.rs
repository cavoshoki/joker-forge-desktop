use crate::lua_ast::*;
use crate::types::ObjectType;

/// Generate the context check expression for a trigger.
///
/// Returns the Lua expression that goes inside `if <expr> then` to determine
/// whether the current calculate() invocation matches this trigger.
pub fn trigger_context(
    object_type: ObjectType,
    trigger: &str,
    blueprint_compat: bool,
) -> Expr {
    let ctx = match object_type {
        ObjectType::Joker => joker_trigger_context(trigger, blueprint_compat),
        ObjectType::Consumable => consumable_trigger_context(trigger),
        ObjectType::Card => card_trigger_context(trigger),
        ObjectType::Voucher => voucher_trigger_context(trigger),
        ObjectType::Deck => deck_trigger_context(trigger),
    };

    ctx.unwrap_or_else(|| {
        // Fallback: emit a raw context comment for unknown triggers
        lua_raw_expr(format!("--[[ unknown trigger: {} ]] false", trigger))
    })
}

/// Generate context for a retrigger-specific trigger path.
/// Retriggers use `context.repetition` instead of `context.individual`.
pub fn retrigger_trigger_context(
    object_type: ObjectType,
    trigger: &str,
    blueprint_compat: bool,
) -> Option<Expr> {
    match (object_type, trigger) {
        (ObjectType::Joker, "card_scored") => {
            let base = lua_and(
                lua_eq(ctx("cardarea"), lua_path(&["G", "play"])),
                ctx("repetition"),
            );
            Some(maybe_blueprint(base, blueprint_compat))
        }
        (ObjectType::Card, "card_scored") => {
            Some(lua_and(ctx("repetition"), lua_eq(ctx("cardarea"), lua_path(&["G", "play"]))))
        }
        _ => None,
    }
}

// ---------------------------------------------------------------------------
// Joker triggers
// ---------------------------------------------------------------------------

fn joker_trigger_context(trigger: &str, bp: bool) -> Option<Expr> {
    let expr = match trigger {
        // Hand scoring
        "hand_played" => bp_check(
            lua_and(lua_eq(ctx("cardarea"), lua_path(&["G", "jokers"])), ctx("joker_main")),
            bp,
        ),
        "before_hand_played" => bp_check(
            lua_and(ctx("before"), lua_and(ctx("joker_main"), lua_not(ctx("blueprint")))),
            false, // blueprint check is embedded
        ),
        "after_hand_played" => bp_check(
            lua_and(ctx("after"), ctx("joker_main")),
            bp,
        ),
        "card_scored" => bp_check(
            lua_and(ctx("individual"), lua_eq(ctx("cardarea"), lua_path(&["G", "play"]))),
            bp,
        ),
        "joker_evaluated" => bp_check(
            lua_and(lua_eq(ctx("cardarea"), lua_path(&["G", "jokers"])), ctx("joker_main")),
            bp,
        ),
        "joker_triggered" => bp_check(
            lua_and(lua_eq(ctx("cardarea"), lua_path(&["G", "jokers"])), ctx("joker_main")),
            bp,
        ),

        // In blind events
        "hand_drawn" => bp_check(
            lua_and(ctx("first_hand_drawn"), ctx("joker_main")),
            bp,
        ),
        "first_hand_drawn" => bp_check(
            lua_and(ctx("first_hand_drawn"), ctx("joker_main")),
            bp,
        ),
        "hand_discarded" => bp_check(
            lua_and(ctx("discard"), ctx("joker_main")),
            bp,
        ),
        "card_discarded" => bp_check(
            lua_and(ctx("individual"), lua_eq(ctx("cardarea"), lua_path(&["G", "play"]))),
            bp,
        ),
        "card_held_in_hand" => bp_check(
            lua_and(
                ctx("individual"),
                lua_and(
                    lua_eq(ctx("cardarea"), lua_path(&["G", "hand"])),
                    lua_not(ctx("end_of_round")),
                ),
            ),
            bp,
        ),

        // Round events
        "round_end" => bp_check(
            lua_and(
                ctx("end_of_round"),
                lua_and(
                    lua_eq(ctx("game_over"), lua_bool(false)),
                    ctx("main_eval"),
                ),
            ),
            bp,
        ),
        "blind_selected" => bp_check(
            lua_and(ctx("setting_blind"), ctx("joker_main")),
            bp,
        ),
        "blind_skipped" => bp_check(
            lua_and(ctx("skip_blind"), ctx("joker_main")),
            bp,
        ),
        "blind_disabled" => bp_check(
            lua_and(ctx("debuffed_hand"), ctx("joker_main")),
            bp,
        ),
        "boss_defeated" => bp_check(
            lua_and(ctx("end_of_round"), ctx("joker_main")),
            bp,
        ),
        "ante_start" => bp_check(
            lua_and(ctx("setting_blind"), ctx("joker_main")),
            bp,
        ),

        // Economy
        "card_bought" => bp_check(
            lua_and(ctx("buying_card"), ctx("joker_main")),
            bp,
        ),
        "card_sold" => bp_check(
            lua_and(ctx("selling_card"), ctx("joker_main")),
            bp,
        ),
        "selling_self" => bp_check(
            lua_and(ctx("selling_self"), ctx("joker_main")),
            bp,
        ),
        "buying_self" => bp_check(
            lua_and(ctx("buying_card"), ctx("joker_main")),
            bp,
        ),
        "shop_entered" => bp_check(
            lua_and(ctx("open_booster"), ctx("joker_main")),
            bp,
        ),
        "shop_exited" => bp_check(
            lua_and(ctx("shop_final"), ctx("joker_main")),
            bp,
        ),
        "shop_reroll" => bp_check(
            lua_and(ctx("reroll_shop"), ctx("joker_main")),
            bp,
        ),

        // Packs & consumables
        "consumable_used" => bp_check(
            ctx("using_consumeable"),
            bp,
        ),
        "playing_card_added" => bp_check(
            lua_and(ctx("playing_card_added"), ctx("joker_main")),
            bp,
        ),
        "booster_opened" => bp_check(
            lua_and(ctx("open_booster"), ctx("joker_main")),
            bp,
        ),

        // Special
        "card_destroyed" => bp_check(
            lua_and(ctx("destroying_card"), ctx("joker_main")),
            bp,
        ),
        "game_over" => bp_check(
            lua_and(ctx("game_over"), ctx("joker_main")),
            bp,
        ),
        "change_probability" => bp_check(
            ctx("change_probability"),
            bp,
        ),

        // Passive doesn't use a context check — handled separately
        "passive" => return None,

        // Dollar bonus triggers (handled via calc_dollar_bonus)
        "blind_reward" | "boss_blind_reward" => return None,

        _ => return None,
    };
    Some(expr)
}

// ---------------------------------------------------------------------------
// Consumable triggers
// ---------------------------------------------------------------------------

fn consumable_trigger_context(trigger: &str) -> Option<Expr> {
    let expr = match trigger {
        "card_used" => ctx("using_consumeable"),
        "hand_played" => lua_and(
            lua_eq(ctx("cardarea"), lua_path(&["G", "jokers"])),
            ctx("joker_main"),
        ),
        _ => return None,
    };
    Some(expr)
}

// ---------------------------------------------------------------------------
// Card triggers (enhancement / seal / edition)
// ---------------------------------------------------------------------------

fn card_trigger_context(trigger: &str) -> Option<Expr> {
    let expr = match trigger {
        "card_scored" => lua_and(
            ctx("individual"),
            lua_eq(ctx("cardarea"), lua_path(&["G", "play"])),
        ),
        "card_held_in_hand" => lua_and(
            ctx("individual"),
            lua_and(
                lua_eq(ctx("cardarea"), lua_path(&["G", "hand"])),
                lua_not(ctx("end_of_round")),
            ),
        ),
        "card_discarded" => lua_and(
            ctx("individual"),
            lua_eq(ctx("cardarea"), lua_path(&["G", "play"])),
        ),
        _ => return None,
    };
    Some(expr)
}

// ---------------------------------------------------------------------------
// Voucher triggers
// ---------------------------------------------------------------------------

fn voucher_trigger_context(trigger: &str) -> Option<Expr> {
    let expr = match trigger {
        "card_used" => ctx("using_consumeable"),
        _ => return None,
    };
    Some(expr)
}

// ---------------------------------------------------------------------------
// Deck triggers
// ---------------------------------------------------------------------------

fn deck_trigger_context(trigger: &str) -> Option<Expr> {
    let expr = match trigger {
        "hand_played" => lua_and(
            lua_eq(ctx("cardarea"), lua_path(&["G", "jokers"])),
            ctx("joker_main"),
        ),
        "card_scored" => lua_and(
            ctx("individual"),
            lua_eq(ctx("cardarea"), lua_path(&["G", "play"])),
        ),
        "round_end" => lua_and(
            ctx("end_of_round"),
            lua_and(
                lua_eq(ctx("game_over"), lua_bool(false)),
                ctx("main_eval"),
            ),
        ),
        _ => return None,
    };
    Some(expr)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Shorthand for `context.field`.
fn ctx(field: &str) -> Expr {
    lua_path(&["context", field])
}

/// Optionally wrap with `and not context.blueprint`.
fn maybe_blueprint(expr: Expr, blueprint_compat: bool) -> Expr {
    if blueprint_compat {
        expr
    } else {
        lua_and(expr, lua_not(ctx("blueprint")))
    }
}

fn bp_check(expr: Expr, blueprint_compat: bool) -> Expr {
    maybe_blueprint(expr, blueprint_compat)
}
