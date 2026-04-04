use crate::compiler::context::CompileContext;
use crate::compiler::effects::EffectOutput;
use crate::lua_ast::*;
use crate::types::EffectDef;

fn get_str(effect: &EffectDef, key: &str) -> Option<String> {
    effect.params.get(key).map(|v| v.to_string_lossy())
}

fn get_str_default(effect: &EffectDef, key: &str, default: &str) -> String {
    match effect.params.get(key) {
        Some(v) => {
            let s = v.to_string_lossy();
            if s.is_empty() {
                default.to_string()
            } else {
                s
            }
        }
        None => default.to_string(),
    }
}

fn is_scoring_trigger(trigger: &str) -> bool {
    matches!(trigger, "hand_played" | "card_scored")
}

// ---------------------------------------------------------------------------
// modify_internal_variable
// ---------------------------------------------------------------------------

/// Modify Internal Variable — changes a user-defined number variable.
pub fn modify_internal_variable(
    effect: &EffectDef,
    ctx: &mut CompileContext,
    trigger: &str,
) -> EffectOutput {
    let variable_name = get_str_default(effect, "variable_name", "var1");
    let operation = get_str_default(effect, "operation", "increment");
    let index_method = get_str_default(effect, "index_method", "self");
    let custom_message = get_str(effect, "customMessage");
    let search_key = get_str_default(effect, "joker_key", "j_joker");
    let search_var = get_str_default(effect, "joker_variable", "jokerVar");
    let scoring = is_scoring_trigger(trigger);

    let resolved = crate::compiler::values::resolve_config_value(
        &effect.params,
        "value",
        ctx,
        &format!("var_{}", variable_name),
    );
    let ability = ctx.ability_path();

    let operation_code = match operation.as_str() {
        "set" => format!("{ab}.{v} = {val}", ab = ability, v = variable_name, val = resolved.lua_str),
        "increment" => format!(
            "{ab}.{v} = ({ab}.{v}) + {val}",
            ab = ability, v = variable_name, val = resolved.lua_str
        ),
        "decrement" => format!(
            "{ab}.{v} = math.max(0, ({ab}.{v}) - {val})",
            ab = ability, v = variable_name, val = resolved.lua_str
        ),
        "multiply" => format!(
            "{ab}.{v} = ({ab}.{v}) * {val}",
            ab = ability, v = variable_name, val = resolved.lua_str
        ),
        "divide" => format!(
            "{ab}.{v} = ({ab}.{v}) / {val}",
            ab = ability, v = variable_name, val = resolved.lua_str
        ),
        "power" => format!(
            "{ab}.{v} = ({ab}.{v}) ^ {val}",
            ab = ability, v = variable_name, val = resolved.lua_str
        ),
        "absolute" => format!(
            "{ab}.{v} = math.abs({ab}.{v})",
            ab = ability, v = variable_name
        ),
        "natural_log" => format!(
            "{ab}.{v} = math.log({ab}.{v})",
            ab = ability, v = variable_name
        ),
        "log10" => format!(
            "{ab}.{v} = math.log10({ab}.{v})",
            ab = ability, v = variable_name
        ),
        "square_root" => format!(
            "{ab}.{v} = math.sqrt({ab}.{v})",
            ab = ability, v = variable_name
        ),
        "ceil" => format!(
            "{ab}.{v} = math.ceil({ab}.{v})",
            ab = ability, v = variable_name
        ),
        "floor" => format!(
            "{ab}.{v} = math.floor({ab}.{v})",
            ab = ability, v = variable_name
        ),
        "index" => match index_method.as_str() {
            "self" => format!(
                "for i = 1, #G.jokers.cards do\n\
                    if G.jokers.cards[i] == card then\n\
                        {ab}.{v} = i\n\
                        break\n\
                    end\n\
                end",
                ab = ability, v = variable_name
            ),
            "random" => format!(
                "{ab}.{v} = math.random(1, #G.jokers.cards)",
                ab = ability, v = variable_name
            ),
            "first" => format!("{ab}.{v} = 1", ab = ability, v = variable_name),
            "last" => format!(
                "{ab}.{v} = #G.jokers.cards",
                ab = ability, v = variable_name
            ),
            "left" => format!(
                "local my_pos = nil\n\
                for i = 1, #G.jokers.cards do\n\
                    if G.jokers.cards[i] == card then\n\
                        my_pos = i\n\
                        break\n\
                    end\n\
                end\n\
                {ab}.{v} = math.max(my_pos - 1, 0)",
                ab = ability, v = variable_name
            ),
            "right" => format!(
                "local my_pos = nil\n\
                for i = 1, #G.jokers.cards do\n\
                    if G.jokers.cards[i] == card then\n\
                        my_pos = i\n\
                        break\n\
                    end\n\
                end\n\
                if my_pos > #G.jokers.cards then\n\
                    my_pos = -1\n\
                end\n\
                {ab}.{v} = my_pos + 1",
                ab = ability, v = variable_name
            ),
            "key" => format!(
                "local search_key = '{key}'\n\
                {ab}.{v} = 0\n\
                for i = 1, #G.jokers.cards do\n\
                    if G.jokers.cards[i].config.center.key == search_key then\n\
                        {ab}.{v} = i\n\
                        break\n\
                    end\n\
                end",
                ab = ability, v = variable_name, key = search_key
            ),
            "variable" => format!(
                "local search_key = {ab}.{sv}\n\
                {ab}.{v} = 0\n\
                for i = 1, #G.jokers.cards do\n\
                    if G.jokers.cards[i].config.center.key == search_key then\n\
                        {ab}.{v} = i\n\
                        break\n\
                    end\n\
                end",
                ab = ability, v = variable_name, sv = search_var
            ),
            "selected_joker" => format!(
                "for i = 1, #G.jokers.cards do\n\
                    if G.jokers.cards[i] == G.jokers.highlighted[1] then\n\
                        {ab}.{v} = i\n\
                        break\n\
                    end\n\
                end",
                ab = ability, v = variable_name
            ),
            "evaled_joker" => format!(
                "for i = 1, #G.jokers.cards do\n\
                    if G.jokers.cards[i] == context.other_joker then\n\
                        {ab}.{v} = i\n\
                        break\n\
                    end\n\
                end",
                ab = ability, v = variable_name
            ),
            _ => format!(
                "{ab}.{v} = ({ab}.{v}) + {val}",
                ab = ability, v = variable_name, val = resolved.lua_str
            ),
        },
        _ => format!(
            "{ab}.{v} = ({ab}.{v}) + {val}",
            ab = ability, v = variable_name, val = resolved.lua_str
        ),
    };

    let message_colour = match operation.as_str() {
        "set" => "G.C.BLUE",
        "increment" => "G.C.GREEN",
        "decrement" => "G.C.RED",
        "multiply" | "divide" => "G.C.MULT",
        _ => "G.C.BLUE",
    };

    let message = custom_message.map(lua_str);

    if scoring {
        EffectOutput {
            return_fields: vec![],
            pre_return: vec![lua_raw_stmt(operation_code)],
            config_vars: vec![],
            message,
            colour: Some(lua_raw_expr(message_colour)),
        }
    } else {
        let func_body = vec![lua_raw_stmt(format!(
            "{}\nreturn true",
            operation_code
        ))];
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
            message,
            colour: Some(lua_raw_expr(message_colour)),
        }
    }
}

// ---------------------------------------------------------------------------
// change_key_variable
// ---------------------------------------------------------------------------

/// Change Key Variable — changes a key-type user variable.
pub fn change_key_variable(effect: &EffectDef, _ctx: &mut CompileContext) -> EffectOutput {
    let variable_name = get_str_default(effect, "variable_name", "keyvar");
    let change_type = get_str_default(effect, "change_type", "specific");
    let key_type = get_str_default(effect, "key_type", "joker");
    let specific_key = get_str_default(effect, "specific_key", "j_joker");
    let custom_message = get_str(effect, "customMessage");

    let code = match change_type.as_str() {
        "random" => match key_type.as_str() {
            "joker" => format!(
                "card.ability.extra.{v} = pseudorandom_element(G.P_CENTER_POOLS.Joker, pseudoseed('{v}')).key",
                v = variable_name
            ),
            "consumable" | "tarot" => format!(
                "card.ability.extra.{v} = pseudorandom_element(G.P_CENTER_POOLS.Tarot, pseudoseed('{v}')).key",
                v = variable_name
            ),
            "planet" => format!(
                "card.ability.extra.{v} = pseudorandom_element(G.P_CENTER_POOLS.Planet, pseudoseed('{v}')).key",
                v = variable_name
            ),
            "spectral" => format!(
                "card.ability.extra.{v} = pseudorandom_element(G.P_CENTER_POOLS.Spectral, pseudoseed('{v}')).key",
                v = variable_name
            ),
            "enhancement" => format!(
                "card.ability.extra.{v} = pseudorandom_element(G.P_CENTER_POOLS.Enhanced, pseudoseed('{v}')).key",
                v = variable_name
            ),
            "seal" => format!(
                "card.ability.extra.{v} = pseudorandom_element(G.P_CENTER_POOLS.Seal, pseudoseed('{v}')).key",
                v = variable_name
            ),
            "edition" => format!(
                "card.ability.extra.{v} = pseudorandom_element(G.P_CENTER_POOLS.Edition, pseudoseed('{v}')).key",
                v = variable_name
            ),
            "voucher" => format!(
                "card.ability.extra.{v} = pseudorandom_element(G.P_CENTER_POOLS.Voucher, pseudoseed('{v}')).key",
                v = variable_name
            ),
            "tag" => format!(
                "card.ability.extra.{v} = pseudorandom_element(G.P_CENTER_POOLS.Tag, pseudoseed('{v}')).key",
                v = variable_name
            ),
            "booster" => format!(
                "card.ability.extra.{v} = pseudorandom_element(G.P_CENTER_POOLS.Booster, pseudoseed('{v}')).key",
                v = variable_name
            ),
            _ => format!(
                "card.ability.extra.{v} = pseudorandom_element(G.P_CENTER_POOLS.Joker, pseudoseed('{v}')).key",
                v = variable_name
            ),
        },
        "scored_card" => format!(
            "card.ability.extra.{v} = context.other_card.config.center.key",
            v = variable_name
        ),
        "evaled_joker" => format!(
            "card.ability.extra.{v} = context.other_joker.config.center.key",
            v = variable_name
        ),
        "selected_joker" => format!(
            "if G.jokers.highlighted[1] then\n\
                card.ability.extra.{v} = G.jokers.highlighted[1].config.center.key\n\
            end",
            v = variable_name
        ),
        _ => format!(
            "card.ability.extra.{v} = '{key}'",
            v = variable_name,
            key = specific_key
        ),
    };

    let message = custom_message.map(lua_str);

    EffectOutput {
        return_fields: vec![],
        pre_return: vec![lua_raw_stmt(code)],
        config_vars: vec![],
        message,
        colour: Some(lua_raw_expr("G.C.FILTER")),
    }
}

// ---------------------------------------------------------------------------
// change_text_variable
// ---------------------------------------------------------------------------

/// Change Text Variable — changes a text-type user variable.
pub fn change_text_variable(effect: &EffectDef, _ctx: &mut CompileContext) -> EffectOutput {
    let variable_name = get_str_default(effect, "variable_name", "textvar");
    let change_type = get_str_default(effect, "change_type", "custom_text");
    let custom_text = get_str_default(effect, "text", "");
    let key_var = get_str_default(effect, "key_variable", "keyvar");
    let custom_message = get_str(effect, "customMessage");

    let code = match change_type.as_str() {
        "key_var" => format!(
            "local all_key_lists = {{}}\n\
            for _, pool in pairs(G.P_CENTER_POOLS) do\n\
                for _, item in pairs(pool) do\n\
                    table.insert(all_key_lists, item)\n\
                end\n\
            end\n\
            for _, current_card in pairs(all_key_lists) do\n\
                if current_card.key == card.ability.extra.{kv} then\n\
                    if current_card.set == 'Seal' then\n\
                        card.ability.extra.{v} = current_card.key\n\
                    else\n\
                        card.ability.extra.{v} = current_card.name\n\
                    end\n\
                    break\n\
                end\n\
            end",
            v = variable_name,
            kv = key_var
        ),
        _ => format!(
            "card.ability.extra.{v} = '{t}'",
            v = variable_name,
            t = custom_text
        ),
    };

    let message = custom_message.map(lua_str);

    EffectOutput {
        return_fields: vec![],
        pre_return: vec![lua_raw_stmt(code)],
        config_vars: vec![],
        message,
        colour: Some(lua_raw_expr("G.C.FILTER")),
    }
}

// ---------------------------------------------------------------------------
// change_rank_variable
// ---------------------------------------------------------------------------

/// Change Rank Variable — changes a rank-type user variable.
pub fn change_rank_variable(effect: &EffectDef, _ctx: &mut CompileContext) -> EffectOutput {
    let variable_name = get_str_default(effect, "variable_name", "rankvar");
    let change_type = get_str_default(effect, "change_type", "random");
    let specific_rank = get_str_default(effect, "specific_rank", "A");
    let custom_message = get_str(effect, "customMessage");

    let code = match change_type.as_str() {
        "random" => format!(
            "if G.playing_cards then\n\
                local valid_{v}_cards = {{}}\n\
                for _, v in ipairs(G.playing_cards) do\n\
                    if not SMODS.has_no_rank(v) then\n\
                        valid_{v}_cards[#valid_{v}_cards + 1] = v\n\
                    end\n\
                end\n\
                if valid_{v}_cards[1] then\n\
                    local {v}_card = pseudorandom_element(valid_{v}_cards, pseudoseed('{v}' .. G.GAME.round_resets.ante))\n\
                    G.GAME.current_round.{v}_card.rank = {v}_card.base.value\n\
                    G.GAME.current_round.{v}_card.id = {v}_card.base.id\n\
                end\n\
            end",
            v = variable_name
        ),
        "scored_card" | "destroyed_card" | "added_card" | "card_held_in_hand"
        | "discarded_card" => format!(
            "G.GAME.current_round.{v}_card.rank = context.other_card.base.id",
            v = variable_name
        ),
        _ => {
            let rank_id = rank_to_id(&specific_rank);
            format!(
                "G.GAME.current_round.{v}_card.rank = '{r}'\n\
                G.GAME.current_round.{v}_card.id = {id}",
                v = variable_name,
                r = specific_rank,
                id = rank_id
            )
        }
    };

    let message = custom_message.map(lua_str);

    EffectOutput {
        return_fields: vec![],
        pre_return: vec![lua_raw_stmt(code)],
        config_vars: vec![],
        message,
        colour: Some(lua_raw_expr("G.C.FILTER")),
    }
}

// ---------------------------------------------------------------------------
// change_suit_variable
// ---------------------------------------------------------------------------

/// Change Suit Variable — changes a suit-type user variable.
pub fn change_suit_variable(effect: &EffectDef, _ctx: &mut CompileContext) -> EffectOutput {
    let variable_name = get_str_default(effect, "variable_name", "suitvar");
    let change_type = get_str_default(effect, "change_type", "random");
    let specific_suit = get_str_default(effect, "specific_suit", "Spades");
    let custom_message = get_str(effect, "customMessage");

    let code = match change_type.as_str() {
        "random" => format!(
            "if G.playing_cards then\n\
                local valid_{v}_cards = {{}}\n\
                for _, v in ipairs(G.playing_cards) do\n\
                    if not SMODS.has_no_suit(v) then\n\
                        valid_{v}_cards[#valid_{v}_cards + 1] = v\n\
                    end\n\
                end\n\
                if valid_{v}_cards[1] then\n\
                    local {v}_card = pseudorandom_element(valid_{v}_cards, pseudoseed('{v}' .. G.GAME.round_resets.ante))\n\
                    G.GAME.current_round.{v}_card.suit = {v}_card.base.suit\n\
                end\n\
            end",
            v = variable_name
        ),
        "scored_card" | "destroyed_card" | "added_card" | "card_held_in_hand"
        | "discarded_card" => format!(
            "G.GAME.current_round.{v}_card.suit = context.other_card.base.suit",
            v = variable_name
        ),
        _ => format!(
            "G.GAME.current_round.{v}_card.suit = '{s}'",
            v = variable_name,
            s = specific_suit
        ),
    };

    let message = custom_message.map(lua_str);

    EffectOutput {
        return_fields: vec![],
        pre_return: vec![lua_raw_stmt(code)],
        config_vars: vec![],
        message,
        colour: Some(lua_raw_expr("G.C.FILTER")),
    }
}

// ---------------------------------------------------------------------------
// change_poker_hand_variable
// ---------------------------------------------------------------------------

/// Change Poker Hand Variable — changes a poker-hand-type user variable.
pub fn change_poker_hand_variable(effect: &EffectDef, _ctx: &mut CompileContext) -> EffectOutput {
    let variable_name = get_str_default(effect, "variable_name", "pokerhandvar");
    let change_type = get_str_default(effect, "change_type", "random");
    let specific = get_str_default(effect, "specific_pokerhand", "High Card");
    let custom_message = get_str(effect, "customMessage");

    let code = match change_type.as_str() {
        "random" => format!(
            "local {v}_hands = {{}}\n\
            for handname, _ in pairs(G.GAME.hands) do\n\
                if G.GAME.hands[handname].visible then\n\
                    {v}_hands[#{v}_hands + 1] = handname\n\
                end\n\
            end\n\
            if {v}_hands[1] then\n\
                G.GAME.current_round.{v}_hand = pseudorandom_element({v}_hands, pseudoseed('{v}' .. G.GAME.round_resets.ante))\n\
            end",
            v = variable_name
        ),
        "most_played" => format!(
            "local {v}_hand, {v}_tally = nil, 0\n\
            for k, v in ipairs(G.handlist) do\n\
                if G.GAME.hands[v].visible and G.GAME.hands[v].played > {v}_tally then\n\
                    {v}_hand = v\n\
                    {v}_tally = G.GAME.hands[v].played\n\
                end\n\
            end\n\
            if {v}_hand then\n\
                G.GAME.current_round.{v}_hand = {v}_hand\n\
            end",
            v = variable_name
        ),
        "least_played" => format!(
            "local {v}_hand, {v}_tally = nil, math.huge\n\
            for k, v in ipairs(G.handlist) do\n\
                if G.GAME.hands[v].visible and G.GAME.hands[v].played < {v}_tally then\n\
                    {v}_hand = v\n\
                    {v}_tally = G.GAME.hands[v].played\n\
                end\n\
            end\n\
            if {v}_hand then\n\
                G.GAME.current_round.{v}_hand = {v}_hand\n\
            end",
            v = variable_name
        ),
        _ => format!(
            "G.GAME.current_round.{v}_hand = '{h}'",
            v = variable_name,
            h = specific
        ),
    };

    let message = custom_message.map(lua_str);

    EffectOutput {
        return_fields: vec![],
        pre_return: vec![lua_raw_stmt(code)],
        config_vars: vec![],
        message,
        colour: Some(lua_raw_expr("G.C.FILTER")),
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn rank_to_id(rank: &str) -> &'static str {
    match rank {
        "A" | "Ace" => "14",
        "K" | "King" => "13",
        "Q" | "Queen" => "12",
        "J" | "Jack" => "11",
        "10" => "10",
        "9" => "9",
        "8" => "8",
        "7" => "7",
        "6" => "6",
        "5" => "5",
        "4" => "4",
        "3" => "3",
        "2" => "2",
        _ => "14",
    }
}
