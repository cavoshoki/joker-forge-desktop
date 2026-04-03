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
