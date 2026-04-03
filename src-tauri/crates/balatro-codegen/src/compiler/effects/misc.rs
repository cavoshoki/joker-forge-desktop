use crate::compiler::context::CompileContext;
use crate::compiler::effects::EffectOutput;
use crate::lua_ast::*;
use crate::types::EffectDef;

/// Show Message effect — displays a status message.
pub fn show_message(effect: &EffectDef, _ctx: &mut CompileContext) -> EffectOutput {
    let msg_type = effect
        .params
        .get("type")
        .and_then(|v| v.as_str())
        .unwrap_or("text");

    let colour = effect
        .params
        .get("colour")
        .and_then(|v| v.as_str())
        .unwrap_or("G.C.WHITE");

    let message = match msg_type {
        "variable" => {
            let var_name = effect
                .params
                .get("textVariable")
                .and_then(|v| v.as_str())
                .unwrap_or("message");
            lua_field(lua_raw_expr("card.ability.extra"), var_name)
        }
        _ => {
            let text = effect
                .params
                .get("customMessage")
                .and_then(|v| v.as_str())
                .unwrap_or("Message!");
            lua_str(text)
        }
    };

    EffectOutput {
        return_fields: vec![],
        pre_return: vec![],
        config_vars: vec![],
        message: Some(message),
        colour: Some(lua_raw_expr(colour)),
    }
}

/// Play Sound effect — plays a game sound.
pub fn play_sound(effect: &EffectDef, _ctx: &mut CompileContext) -> EffectOutput {
    let sound = effect
        .params
        .get("sound")
        .and_then(|v| v.as_str())
        .unwrap_or("card1");

    let play = lua_expr_stmt(lua_call("play_sound", vec![lua_str(sound)]));

    EffectOutput {
        return_fields: vec![],
        pre_return: vec![play],
        config_vars: vec![],
        message: None,
        colour: None,
    }
}

/// Juice Up Joker — visual juice animation on the joker card.
pub fn juice_up_joker(_effect: &EffectDef, _ctx: &mut CompileContext) -> EffectOutput {
    let juice = lua_expr_stmt(lua_method(
        lua_ident("card"),
        "juice_up",
        vec![lua_num(0.3), lua_num(0.5)],
    ));

    EffectOutput {
        return_fields: vec![],
        pre_return: vec![juice],
        config_vars: vec![],
        message: None,
        colour: None,
    }
}

/// Set Dollars — adds or removes money.
pub fn set_dollars(effect: &EffectDef, ctx: &mut CompileContext) -> EffectOutput {
    let count = ctx.next_effect_count("dollars");
    let var_name = ctx.unique_var_name("dollars", count);

    let value = effect.params.get("value");
    let value_expr = if let Some(val) = value {
        match val {
            crate::types::ParamValue::Int(n) => {
                ctx.add_config_int(&var_name, *n);
                crate::compiler::values::ability_path_expr(ctx.object_type, &var_name)
            }
            crate::types::ParamValue::Float(n) => {
                ctx.add_config_int(&var_name, *n as i64);
                crate::compiler::values::ability_path_expr(ctx.object_type, &var_name)
            }
            _ => crate::compiler::values::resolve_value(val, ctx.object_type, None),
        }
    } else {
        lua_int(0)
    };

    EffectOutput {
        return_fields: vec![("dollars".to_string(), value_expr)],
        pre_return: vec![],
        config_vars: vec![],
        message: None,
        colour: Some(lua_raw_expr("G.C.MONEY")),
    }
}

/// Retrigger effect — causes cards to retrigger.
pub fn retrigger(effect: &EffectDef, ctx: &mut CompileContext) -> EffectOutput {
    let count = ctx.next_effect_count("repetitions");
    let var_name = ctx.unique_var_name("repetitions", count);

    let value = effect.params.get("value");
    let value_expr = if let Some(val) = value {
        match val {
            crate::types::ParamValue::Int(n) => {
                ctx.add_config_int(&var_name, *n);
                crate::compiler::values::ability_path_expr(ctx.object_type, &var_name)
            }
            _ => crate::compiler::values::resolve_value(val, ctx.object_type, None),
        }
    } else {
        ctx.add_config_int(&var_name, 1);
        crate::compiler::values::ability_path_expr(ctx.object_type, &var_name)
    };

    EffectOutput {
        return_fields: vec![("repetitions".to_string(), value_expr)],
        pre_return: vec![],
        config_vars: vec![],
        message: Some(lua_call("localize", vec![lua_str("k_again_ex")])),
        colour: Some(lua_raw_expr("G.C.RED")),
    }
}

/// Level Up Hand effect.
pub fn level_up_hand(effect: &EffectDef, _ctx: &mut CompileContext) -> EffectOutput {
    let hand = effect
        .params
        .get("hand")
        .and_then(|v| v.as_str());
    let amount = effect
        .params
        .get("amount")
        .and_then(|v| v.as_i64())
        .unwrap_or(1);

    let level_call = if let Some(h) = hand {
        lua_expr_stmt(lua_call("level_up_hand", vec![
            lua_ident("card"),
            lua_str(h),
            lua_bool(false),
            lua_int(amount),
        ]))
    } else {
        // Level up the scoring hand
        lua_expr_stmt(lua_call("level_up_hand", vec![
            lua_ident("card"),
            lua_path(&["context", "scoring_name"]),
            lua_bool(false),
            lua_int(amount),
        ]))
    };

    EffectOutput {
        return_fields: vec![],
        pre_return: vec![level_call],
        config_vars: vec![],
        message: Some(lua_call("localize", vec![lua_str("k_level_up_ex")])),
        colour: Some(lua_raw_expr("G.C.GREEN")),
    }
}

/// Edit Blind Size — modifies the blind's chip requirement.
pub fn edit_blind_size(effect: &EffectDef, _ctx: &mut CompileContext) -> EffectOutput {
    let operator = effect
        .params
        .get("operator")
        .and_then(|v| v.as_str())
        .unwrap_or("multiply");
    let value = effect
        .params
        .get("value")
        .and_then(|v| v.as_f64())
        .unwrap_or(1.0);

    let new_val = match operator {
        "multiply" => lua_mul(lua_path(&["G", "GAME", "blind", "chips"]), lua_num(value)),
        "divide" => lua_div(lua_path(&["G", "GAME", "blind", "chips"]), lua_num(value)),
        "add" => lua_add(lua_path(&["G", "GAME", "blind", "chips"]), lua_num(value)),
        "subtract" => lua_sub(lua_path(&["G", "GAME", "blind", "chips"]), lua_num(value)),
        "set" => lua_num(value),
        _ => lua_mul(lua_path(&["G", "GAME", "blind", "chips"]), lua_num(value)),
    };

    let assign = lua_assign(lua_path(&["G", "GAME", "blind", "chips"]), new_val);

    EffectOutput {
        return_fields: vec![],
        pre_return: vec![assign],
        config_vars: vec![],
        message: None,
        colour: None,
    }
}

/// Set Sell Value effect — adjusts card sell value.
pub fn set_sell_value(effect: &EffectDef, _ctx: &mut CompileContext) -> EffectOutput {
    let operation = effect
        .params
        .get("operation")
        .and_then(|v| v.as_str())
        .unwrap_or("add");
    let value = effect
        .params
        .get("value")
        .and_then(|v| v.as_i64())
        .unwrap_or(1);

    let stmt = match operation {
        "set" => lua_raw_stmt(format!(
            "card.ability.extra_value = {}; if card.set_cost then card:set_cost() end",
            value
        )),
        "subtract" => lua_raw_stmt(format!(
            "card.ability.extra_value = math.max(0, (card.ability.extra_value or 0) - {}); if card.set_cost then card:set_cost() end",
            value
        )),
        _ => lua_raw_stmt(format!(
            "card.ability.extra_value = (card.ability.extra_value or 0) + {}; if card.set_cost then card:set_cost() end",
            value
        )),
    };

    EffectOutput {
        return_fields: vec![],
        pre_return: vec![stmt],
        config_vars: vec![],
        message: Some(lua_str("Sell Value Updated")),
        colour: Some(lua_raw_expr("G.C.MONEY")),
    }
}

/// Set Ante effect.
pub fn set_ante(effect: &EffectDef, _ctx: &mut CompileContext) -> EffectOutput {
    let operation = effect
        .params
        .get("operation")
        .and_then(|v| v.as_str())
        .unwrap_or("set");
    let value = effect
        .params
        .get("value")
        .and_then(|v| v.as_i64())
        .unwrap_or(1);

    let mod_expr = match operation {
        "subtract" => format!("-{}", value),
        "add" => format!("{}", value),
        _ => format!("{} - (G.GAME.round_resets.ante or 0)", value),
    };

    let stmt = lua_raw_stmt(format!(
        "local mod = {}; ease_ante(mod); G.GAME.round_resets.blind_ante = (G.GAME.round_resets.blind_ante or 0) + mod",
        mod_expr
    ));

    EffectOutput {
        return_fields: vec![],
        pre_return: vec![stmt],
        config_vars: vec![],
        message: Some(lua_str("Ante Updated")),
        colour: Some(lua_raw_expr("G.C.YELLOW")),
    }
}

/// Disable Boss Blind effect.
pub fn disable_boss_blind(_effect: &EffectDef, _ctx: &mut CompileContext) -> EffectOutput {
    let stmt = lua_raw_stmt(
        "if G.GAME.blind and G.GAME.blind.boss and not G.GAME.blind.disabled then G.GAME.blind:disable(); play_sound('timpani') end",
    );

    EffectOutput {
        return_fields: vec![],
        pre_return: vec![stmt],
        config_vars: vec![],
        message: Some(lua_call("localize", vec![lua_str("ph_boss_disabled")])),
        colour: Some(lua_raw_expr("G.C.GREEN")),
    }
}

/// Force Game Over effect.
pub fn force_game_over(_effect: &EffectDef, _ctx: &mut CompileContext) -> EffectOutput {
    let stmt = lua_raw_stmt(
        "G.E_MANAGER:add_event(Event({ trigger = 'after', delay = 0.5, func = function() if G.STAGE == G.STAGES.RUN then G.STATE = G.STATES.GAME_OVER; G.STATE_COMPLETE = false end return true end }))",
    );

    EffectOutput {
        return_fields: vec![],
        pre_return: vec![stmt],
        config_vars: vec![],
        message: Some(lua_str("Game Over")),
        colour: Some(lua_raw_expr("G.C.RED")),
    }
}

/// Win Game effect.
pub fn win_game(effect: &EffectDef, _ctx: &mut CompileContext) -> EffectOutput {
    let win_type = effect
        .params
        .get("win_type")
        .and_then(|v| v.as_str())
        .unwrap_or("blind");

    let stmt = if win_type == "run" {
        lua_raw_stmt("win_game(); G.GAME.won = true")
    } else {
        lua_raw_stmt(
            "if G.STATE == G.STATES.SELECTING_HAND then G.GAME.chips = G.GAME.blind.chips; G.STATE = G.STATES.HAND_PLAYED; G.STATE_COMPLETE = true; end_round() end",
        )
    };

    EffectOutput {
        return_fields: vec![],
        pre_return: vec![stmt],
        config_vars: vec![],
        message: Some(lua_str("Win!")),
        colour: Some(lua_raw_expr("G.C.ORANGE")),
    }
}

/// Crash Game effect — throws a Lua error, intentionally crashing.
pub fn crash_game(effect: &EffectDef, _ctx: &mut CompileContext) -> EffectOutput {
    let message = effect
        .params
        .get("customMessage")
        .and_then(|v| v.as_str())
        .unwrap_or("EasternFarmer Was Here")
        .replace('"', "\\\"")
        .replace('\'', "\\'");

    let stmt = lua_raw_stmt(format!("error(\"{}\")", message));

    EffectOutput {
        return_fields: vec![],
        pre_return: vec![stmt],
        config_vars: vec![],
        message: None,
        colour: None,
    }
}

/// Show Special Message — displays an attention_text popup in the centre of the screen.
pub fn show_special_message(effect: &EffectDef, ctx: &mut CompileContext) -> EffectOutput {
    let custom_message = effect
        .params
        .get("customMessage")
        .and_then(|v| v.as_str())
        .unwrap_or("Special Message!");

    let colour = effect
        .params
        .get("colour")
        .and_then(|v| v.as_str())
        .unwrap_or("G.C.WHITE");

    // scale and hold can be parameterised; fall back to sensible defaults
    let scale = effect.params.get("scale").and_then(|v| v.as_f64()).unwrap_or(1.0);
    let hold = effect.params.get("hold").and_then(|v| v.as_f64()).unwrap_or(1.2);
    let silent = effect.params.get("silent").and_then(|v| v.as_str()).unwrap_or("true");

    let _ = ctx; // no config vars needed

    let lua = format!(
        "G.E_MANAGER:add_event(Event({{\n\
            trigger = 'after',\n\
            delay = 0.4,\n\
            func = function()\n\
                attention_text({{\n\
                    text = \"{msg}\",\n\
                    scale = {scale},\n\
                    hold = {hold},\n\
                    major = card,\n\
                    backdrop_colour = {colour},\n\
                    align = (G.STATE == G.STATES.TAROT_PACK or G.STATE == G.STATES.SPECTRAL_PACK or G.STATE == G.STATES.SMODS_BOOSTER_OPENED) and 'tm' or 'cm',\n\
                    offset = {{ x = 0, y = (G.STATE == G.STATES.TAROT_PACK or G.STATE == G.STATES.SPECTRAL_PACK or G.STATE == G.STATES.SMODS_BOOSTER_OPENED) and -0.2 or 0 }},\n\
                    silent = {silent},\n\
                }})\n\
                G.E_MANAGER:add_event(Event({{\n\
                    trigger = 'after',\n\
                    delay = 0.06 * G.SETTINGS.GAMESPEED,\n\
                    blockable = false,\n\
                    blocking = false,\n\
                    func = function()\n\
                        play_sound('tarot2', 0.76, 0.4)\n\
                        return true\n\
                    end\n\
                }}))\n\
                play_sound('tarot2', 1, 0.4)\n\
                card:juice_up(0.3, 0.5)\n\
                return true\n\
            end\n\
        }}))",
        msg = custom_message,
        scale = scale,
        hold = hold,
        colour = colour,
        silent = silent
    );

    EffectOutput {
        return_fields: vec![],
        pre_return: vec![lua_raw_stmt(lua)],
        config_vars: vec![],
        message: None,
        colour: None,
    }
}

/// Shuffle Jokers — animates joker shuffling.
pub fn shuffle_jokers(effect: &EffectDef, _ctx: &mut CompileContext) -> EffectOutput {
    let custom_message = effect
        .params
        .get("customMessage")
        .and_then(|v| v.as_str())
        .map(str::to_owned);

    let lua = "if #G.jokers.cards > 1 then\n\
        G.jokers:unhighlight_all()\n\
        G.E_MANAGER:add_event(Event({\n\
            trigger = 'before',\n\
            func = function()\n\
                G.E_MANAGER:add_event(Event({\n\
                    func = function()\n\
                        G.jokers:shuffle('aajk')\n\
                        play_sound('cardSlide1', 0.85)\n\
                        return true\n\
                    end,\n\
                }))\n\
                delay(0.15)\n\
                G.E_MANAGER:add_event(Event({\n\
                    func = function()\n\
                        G.jokers:shuffle('aajk')\n\
                        play_sound('cardSlide1', 1.15)\n\
                        return true\n\
                    end\n\
                }))\n\
                delay(0.15)\n\
                G.E_MANAGER:add_event(Event({\n\
                    func = function()\n\
                        G.jokers:shuffle('aajk')\n\
                        play_sound('cardSlide1', 1)\n\
                        return true\n\
                    end\n\
                }))\n\
                delay(0.5)\n\
                return true\n\
            end\n\
        }))\n\
    end";

    let message = custom_message
        .map(|m| lua_str(m))
        .unwrap_or_else(|| lua_str("Shuffle!"));

    EffectOutput {
        return_fields: vec![],
        pre_return: vec![lua_raw_stmt(lua)],
        config_vars: vec![],
        message: Some(message),
        colour: Some(lua_raw_expr("G.C.ORANGE")),
    }
}

/// Flip Joker — flips a joker card face-up or face-down.
pub fn flip_joker(effect: &EffectDef, _ctx: &mut CompileContext) -> EffectOutput {
    let selection_method = effect
        .params
        .get("selection_method")
        .and_then(|v| v.as_str())
        .unwrap_or("random");
    let position = effect
        .params
        .get("position")
        .and_then(|v| v.as_str())
        .unwrap_or("first");
    let specific_index = effect
        .params
        .get("specific_index")
        .and_then(|v| v.as_i64())
        .unwrap_or(1);
    let custom_message = effect
        .params
        .get("customMessage")
        .and_then(|v| v.as_str())
        .map(str::to_owned);
    let joker_variable = effect
        .params
        .get("joker_variable")
        .and_then(|v| v.as_str())
        .unwrap_or("j_joker");

    let flip_code = match selection_method {
        "all" => "if #G.jokers.cards > 0 then\n\
                for _, joker in ipairs(G.jokers.cards) do\n\
                    joker:flip()\n\
                end\n\
            end"
            .to_string(),
        "selected_joker" => "if #G.jokers.cards > 0 then\n\
                for i = 1, #G.jokers.highlighted do\n\
                    G.jokers.highlighted[i]:flip()\n\
                    break\n\
                end\n\
            end"
            .to_string(),
        "evaled_joker" => "if #G.jokers.cards > 0 then\n\
                context.other_joker:flip()\n\
            end"
            .to_string(),
        "self" => "if #G.jokers.cards > 0 then\n\
                for _, joker in ipairs(G.jokers.cards) do\n\
                    if joker == card then\n\
                        joker:flip()\n\
                        break\n\
                    end\n\
                end\n\
            end"
            .to_string(),
        "position" => match position {
            "first" => "if G.jokers.cards[1] then\n    G.jokers.cards[1]:flip()\nend".to_string(),
            "last" => "if G.jokers.cards[#G.jokers.cards] then\n    G.jokers.cards[#G.jokers.cards]:flip()\nend".to_string(),
            "left" => "local self_index = 1\n\
                    if #G.jokers.cards > 0 then\n\
                        for i = 1, #G.jokers.cards do\n\
                            if G.jokers.cards[i] == card then self_index = i; break end\n\
                        end\n\
                        if self_index > 1 then G.jokers.cards[self_index - 1]:flip() end\n\
                    end"
                .to_string(),
            "right" => "local self_index = 1\n\
                    if #G.jokers.cards > 0 then\n\
                        for i = 1, #G.jokers.cards do\n\
                            if G.jokers.cards[i] == card then self_index = i; break end\n\
                        end\n\
                        if self_index < #G.jokers.cards then G.jokers.cards[self_index + 1]:flip() end\n\
                    end"
                .to_string(),
            _ => format!(
                "if #G.jokers.cards > 0 then\n\
                    if G.jokers.cards[{}] then G.jokers.cards[{}]:flip() end\n\
                end",
                specific_index, specific_index
            ),
        },
        "variable" => format!(
            "local joker_to_flip_key = card.ability.extra.{}\n\
            for i = 1, #G.jokers.cards do\n\
                if G.jokers.cards[i].config.center.key == joker_to_flip_key then\n\
                    G.jokers.cards[i]:flip()\n\
                end\n\
            end",
            joker_variable
        ),
        _ => "if #G.jokers.cards > 0 then\n\
                local available_jokers = {}\n\
                for i, joker in ipairs(G.jokers.cards) do\n\
                    table.insert(available_jokers, joker)\n\
                end\n\
                pseudorandom_element(available_jokers, pseudoseed('flip_joker')):flip()\n\
            end"
            .to_string(),
    };

    let message = custom_message
        .map(|m| lua_str(m))
        .unwrap_or_else(|| lua_str("Flip!"));

    EffectOutput {
        return_fields: vec![],
        pre_return: vec![lua_raw_stmt(flip_code)],
        config_vars: vec![],
        message: Some(message),
        colour: Some(lua_raw_expr("G.C.ORANGE")),
    }
}

/// Copy Joker — copies a joker (for joker context).
pub fn copy_joker(effect: &EffectDef, _ctx: &mut CompileContext, trigger: &str) -> EffectOutput {
    let selection_method = effect
        .params
        .get("selection_method")
        .and_then(|v| v.as_str())
        .unwrap_or("random");
    let joker_key = effect
        .params
        .get("joker_key")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let position = effect
        .params
        .get("position")
        .and_then(|v| v.as_str())
        .unwrap_or("first");
    let specific_index = effect
        .params
        .get("specific_index")
        .and_then(|v| v.as_i64())
        .unwrap_or(1);
    let edition = effect
        .params
        .get("edition")
        .and_then(|v| v.as_str())
        .unwrap_or("none");
    let sticker = effect
        .params
        .get("sticker")
        .and_then(|v| v.as_str())
        .unwrap_or("none");
    let ignore_slots = effect
        .params
        .get("ignore_slots")
        .and_then(|v| v.as_str())
        .map(|s| s == "ignore")
        .unwrap_or(false);
    let custom_message = effect
        .params
        .get("customMessage")
        .and_then(|v| v.as_str())
        .map(str::to_owned);

    let scoring = matches!(trigger, "hand_played" | "card_scored");

    let normalized_key = if joker_key.starts_with("j_") {
        joker_key.to_string()
    } else if joker_key.is_empty() {
        String::new()
    } else {
        format!("j_{}", joker_key)
    };

    let is_negative = edition == "e_negative";
    let has_edition = edition != "none" && !edition.is_empty();
    let has_sticker = sticker != "none" && !sticker.is_empty();

    let joker_selection = match selection_method {
        "specific" if !normalized_key.is_empty() => format!(
            "local target_joker = nil\n\
            for i, joker in ipairs(G.jokers.cards) do\n\
                if joker.config.center.key == \"{}\" then\n\
                    target_joker = joker\n\
                    break\n\
                end\n\
            end",
            normalized_key
        ),
        "position" => match position {
            "first" => "local target_joker = G.jokers.cards[1] or nil".to_string(),
            "last" => "local target_joker = G.jokers.cards[#G.jokers.cards] or nil".to_string(),
            "left" => "local my_pos = nil\n\
                    for i = 1, #G.jokers.cards do\n\
                        if G.jokers.cards[i] == card then my_pos = i; break end\n\
                    end\n\
                    local target_joker = (my_pos and my_pos > 1) and G.jokers.cards[my_pos - 1] or nil"
                .to_string(),
            "right" => "local my_pos = nil\n\
                    for i = 1, #G.jokers.cards do\n\
                        if G.jokers.cards[i] == card then my_pos = i; break end\n\
                    end\n\
                    local target_joker = (my_pos and my_pos < #G.jokers.cards) and G.jokers.cards[my_pos + 1] or nil"
                .to_string(),
            _ => format!(
                "local target_joker = G.jokers.cards[{}] or nil",
                specific_index
            ),
        },
        _ => "local available_jokers = {}\n\
                for i, joker in ipairs(G.jokers.cards) do\n\
                    table.insert(available_jokers, joker)\n\
                end\n\
                local target_joker = #available_jokers > 0 and pseudorandom_element(available_jokers, pseudoseed('copy_joker')) or nil"
            .to_string(),
    };

    let space_check = if is_negative || ignore_slots {
        "if target_joker then".to_string()
    } else {
        "if target_joker and #G.jokers.cards + G.GAME.joker_buffer < G.jokers.config.card_limit then".to_string()
    };

    let edition_code = if has_edition {
        format!("\n            copied_joker:set_edition(\"{}\", true)", edition)
    } else {
        String::new()
    };

    let sticker_code = if has_sticker {
        format!("\n            copied_joker:add_sticker('{}', true)", sticker)
    } else {
        String::new()
    };

    let buffer_code = if is_negative { String::new() } else { "\n            G.GAME.joker_buffer = G.GAME.joker_buffer + 1".to_string() };
    let buffer_reset = if is_negative { String::new() } else { "\n            G.GAME.joker_buffer = 0".to_string() };

    let msg_lua = custom_message
        .map(|m| format!("\"{}\"", m))
        .unwrap_or_else(|| "localize('k_duplicated_ex')".to_string());

    let copy_code = format!(
        "{selection}\n\
        {space_check}{buffer}\n\
            G.E_MANAGER:add_event(Event({{\n\
                func = function()\n\
                    local copied_joker = copy_card(target_joker, nil, nil, nil, target_joker.edition and target_joker.edition.negative){edition}{sticker}\n\
                    copied_joker:add_to_deck()\n\
                    G.jokers:emplace(copied_joker){reset}\n\
                    return true\n\
                end\n\
            }}))\n\
            card_eval_status_text(context.blueprint_card or card, 'extra', nil, nil, nil, {{message = {msg}, colour = G.C.GREEN}})\n\
        end",
        selection = joker_selection,
        space_check = space_check,
        buffer = buffer_code,
        edition = edition_code,
        sticker = sticker_code,
        reset = buffer_reset,
        msg = msg_lua
    );

    if scoring {
        EffectOutput {
            return_fields: vec![],
            pre_return: vec![lua_raw_stmt(copy_code)],
            config_vars: vec![],
            message: None,
            colour: Some(lua_raw_expr("G.C.GREEN")),
        }
    } else {
        let func_body = vec![lua_raw_stmt(format!("{}\nreturn true", copy_code))];
        EffectOutput {
            return_fields: vec![(
                "func".to_string(),
                Expr::Function {
                    params: vec![],
                    body: func_body,
                },
            )],
            pre_return: vec![],
            config_vars: vec![],
            message: None,
            colour: Some(lua_raw_expr("G.C.GREEN")),
        }
    }
}

/// Copy Consumable — copies a consumable card from the consumables area.
pub fn copy_consumable(effect: &EffectDef, _ctx: &mut CompileContext, trigger: &str) -> EffectOutput {
    let consumable_type = effect
        .params
        .get("consumable_type")
        .and_then(|v| v.as_str())
        .unwrap_or("random");
    let specific_card = effect
        .params
        .get("specific_card")
        .and_then(|v| v.as_str())
        .unwrap_or("random");
    let is_negative = effect
        .params
        .get("is_negative")
        .and_then(|v| v.as_str())
        .map(|s| s == "negative")
        .unwrap_or(false);
    let custom_message = effect
        .params
        .get("customMessage")
        .and_then(|v| v.as_str())
        .map(str::to_owned);

    let scoring = matches!(trigger, "hand_played" | "card_scored");

    let slot_check = if is_negative { "" } else { "and #G.consumeables.cards + G.GAME.consumeable_buffer < G.consumeables.config.card_limit" };
    let buffer_code = if is_negative { "" } else { "G.GAME.consumeable_buffer = G.GAME.consumeable_buffer + 1" };
    let buffer_reset = if is_negative { "" } else { "G.GAME.consumeable_buffer = 0" };
    let negative_set = if is_negative { "\n                        copied_card:set_edition(\"e_negative\", true)" } else { "" };

    let msg_lua = custom_message
        .map(|m| format!("\"{}\"", m))
        .unwrap_or_else(|| "\"Copied Consumable!\"".to_string());

    let status_target = if scoring {
        "context.blueprint_card or card"
    } else {
        "context.blueprint_card or card"
    };

    let filter = if consumable_type == "random" {
        String::new()
    } else if specific_card == "random" {
        format!("\n            if consumable.ability.set == \"{}\" then", consumable_type)
    } else {
        format!(
            "\n            if consumable.ability.set == \"{}\" and consumable.config.center.key == \"{}\" then",
            consumable_type, specific_card
        )
    };
    let filter_end = if consumable_type == "random" { "" } else { "\n            end" };

    let copy_code = format!(
        "local target_cards = {{}}\n\
        for i, consumable in ipairs(G.consumeables.cards) do{filter}\n\
            table.insert(target_cards, consumable){filter_end}\n\
        end\n\
        if #target_cards > 0 {slot_check} then\n\
            local card_to_copy = pseudorandom_element(target_cards, pseudoseed('copy_consumable'))\n\
            {buffer}\n\
            G.E_MANAGER:add_event(Event({{\n\
                func = function()\n\
                    local copied_card = copy_card(card_to_copy){negative}\n\
                    copied_card:add_to_deck()\n\
                    G.consumeables:emplace(copied_card)\n\
                    {reset}\n\
                    return true\n\
                end\n\
            }}))\n\
            card_eval_status_text({status}, 'extra', nil, nil, nil, {{message = {msg}, colour = G.C.GREEN}})\n\
        end",
        filter = filter,
        filter_end = filter_end,
        slot_check = slot_check,
        buffer = buffer_code,
        negative = negative_set,
        reset = buffer_reset,
        status = status_target,
        msg = msg_lua,
    );

    if scoring {
        EffectOutput {
            return_fields: vec![],
            pre_return: vec![lua_raw_stmt(copy_code)],
            config_vars: vec![],
            message: None,
            colour: Some(lua_raw_expr("G.C.GREEN")),
        }
    } else {
        let func_body = vec![lua_raw_stmt(format!("{}\nreturn true", copy_code))];
        EffectOutput {
            return_fields: vec![(
                "func".to_string(),
                Expr::Function {
                    params: vec![],
                    body: func_body,
                },
            )],
            pre_return: vec![],
            config_vars: vec![],
            message: None,
            colour: Some(lua_raw_expr("G.C.GREEN")),
        }
    }
}

/// Draw Cards — draws additional cards into the hand.
pub fn draw_cards(effect: &EffectDef, ctx: &mut CompileContext) -> EffectOutput {
    let count = ctx.next_effect_count("card_draw");
    let var_name = ctx.unique_var_name("card_draw", count);

    let _value_expr = if let Some(val) = effect.params.get("value") {
        match val {
            crate::types::ParamValue::Int(n) => {
                ctx.add_config_int(&var_name, *n);
                crate::compiler::values::ability_path_expr(ctx.object_type, &var_name)
            }
            _ => crate::compiler::values::resolve_value(val, ctx.object_type, None),
        }
    } else {
        ctx.add_config_int(&var_name, 1);
        crate::compiler::values::ability_path_expr(ctx.object_type, &var_name)
    };

    let custom_message = effect
        .params
        .get("customMessage")
        .and_then(|v| v.as_str())
        .map(str::to_owned);

    // Emit the value expr to string for use in the message concat
    let val_path = format!("{}.{}", ctx.ability_path(), var_name);

    let draw_stmt = lua_raw_stmt(format!(
        "if G.hand and #G.hand.cards > 0 then\n    SMODS.draw_cards({})\nend",
        val_path
    ));

    let message = custom_message
        .map(|m| lua_str(m))
        .unwrap_or_else(|| lua_raw_expr(format!("\"+\"..tostring({})..' Cards Drawn'", val_path)));

    EffectOutput {
        return_fields: vec![],
        pre_return: vec![draw_stmt],
        config_vars: vec![],
        message: Some(message),
        colour: Some(lua_raw_expr("G.C.BLUE")),
    }
}

/// Emit Flag — sets a game pool flag.
pub fn emit_flag(effect: &EffectDef, ctx: &mut CompileContext) -> EffectOutput {
    let flag_name = effect
        .params
        .get("flag_name")
        .and_then(|v| v.as_str())
        .unwrap_or("custom_flag");
    let change = effect
        .params
        .get("change")
        .and_then(|v| v.as_str())
        .unwrap_or("true");
    let custom_message = effect
        .params
        .get("customMessage")
        .and_then(|v| v.as_str())
        .map(str::to_owned);

    // Sanitise flag name: replace non-alphanumeric chars with underscores
    let safe_flag: String = flag_name
        .trim()
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '_' { c } else { '_' })
        .collect();

    let mod_prefix = ctx.mod_prefix.clone();
    let full_flag = format!("{}_{}", mod_prefix, safe_flag);

    let change_code = if change == "invert" {
        format!("not (G.GAME.pool_flags.{} or false)", full_flag)
    } else {
        change.to_string()
    };

    let msg_text = custom_message.unwrap_or_else(|| safe_flag.clone());

    let lua = format!(
        "G.E_MANAGER:add_event(Event({{\n\
            trigger = 'after',\n\
            delay = 0.4,\n\
            func = function()\n\
                card:juice_up(0.3, 0.5)\n\
                card_eval_status_text(card, 'extra', nil, nil, nil, {{message = \"{msg}\", colour = G.C.BLUE}})\n\
                G.GAME.pool_flags.{flag} = {change}\n\
                return true\n\
            end\n\
        }}))",
        msg = msg_text,
        flag = full_flag,
        change = change_code
    );

    EffectOutput {
        return_fields: vec![],
        pre_return: vec![lua_raw_stmt(lua)],
        config_vars: vec![],
        message: None,
        colour: Some(lua_raw_expr("G.C.BLUE")),
    }
}

/// Add Booster Into Shop — adds a booster pack to the current shop.
pub fn add_booster_into_shop(effect: &EffectDef, _ctx: &mut CompileContext) -> EffectOutput {
    let method = effect
        .params
        .get("method_type")
        .and_then(|v| v.as_str())
        .unwrap_or("specific");
    let specific_booster = effect
        .params
        .get("specific_key")
        .and_then(|v| v.as_str())
        .unwrap_or("p_arcana_normal_1");
    let booster_variable = effect
        .params
        .get("key_variable")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let booster_code = match method {
        "key_var" => format!("SMODS.add_booster_to_shop(card.ability.extra.{})", booster_variable),
        "random" => "SMODS.add_booster_to_shop()".to_string(),
        _ => format!("SMODS.add_booster_to_shop('{}')", specific_booster),
    };

    EffectOutput {
        return_fields: vec![],
        pre_return: vec![lua_raw_stmt(booster_code)],
        config_vars: vec![],
        message: Some(lua_str("Added Booster!")),
        colour: Some(lua_raw_expr("G.C.BLUE")),
    }
}

/// Add Voucher Into Shop — adds a voucher to the current shop.
pub fn add_voucher_into_shop(effect: &EffectDef, _ctx: &mut CompileContext) -> EffectOutput {
    let method = effect
        .params
        .get("method_type")
        .and_then(|v| v.as_str())
        .unwrap_or("specific");
    let specific_voucher = effect
        .params
        .get("specific_key")
        .and_then(|v| v.as_str())
        .unwrap_or("v_overstock_norm");
    let voucher_variable = effect
        .params
        .get("key_variable")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let duration = effect
        .params
        .get("duration")
        .and_then(|v| v.as_str())
        .unwrap_or("false");

    let voucher_code = match method {
        "key_var" => format!(
            "SMODS.add_voucher_to_shop(card.ability.extra.{}, {})",
            voucher_variable, duration
        ),
        "random" => format!("SMODS.add_voucher_to_shop(nil, {})", duration),
        _ => format!(
            "SMODS.add_voucher_to_shop('{}', {})",
            specific_voucher, duration
        ),
    };

    EffectOutput {
        return_fields: vec![],
        pre_return: vec![lua_raw_stmt(voucher_code)],
        config_vars: vec![],
        message: Some(lua_str("Added Voucher!")),
        colour: Some(lua_raw_expr("G.C.BLUE")),
    }
}

/// Edit Card Appearance — modifies a card's `in_pool` function to show/hide it.
pub fn edit_card_appearance(effect: &EffectDef, _ctx: &mut CompileContext) -> EffectOutput {
    let appearance = effect
        .params
        .get("card_appearance")
        .and_then(|v| v.as_str())
        .unwrap_or("appear");
    let key = effect
        .params
        .get("key")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    if key.is_empty() || appearance == "none" {
        return EffectOutput::default();
    }

    let code = if appearance == "appear" {
        format!("G.P_CENTERS[\"{}\"].in_pool = function() return true end", key)
    } else {
        format!("G.P_CENTERS[\"{}\"].in_pool = function() return false end", key)
    };

    EffectOutput {
        return_fields: vec![],
        pre_return: vec![lua_raw_stmt(code)],
        config_vars: vec![],
        message: None,
        colour: Some(lua_raw_expr("G.C.MONEY")),
    }
}
