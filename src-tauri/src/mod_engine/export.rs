//! Input types that mirror the TypeScript `JokerData` interface and a mapper
//! that converts them into the canonical `balatro_codegen::types::JokerDef`.
//!
//! This module is the *single source of truth* for the `JokerData → JokerDef`
//! conversion. Previously this logic lived in the TypeScript `mapJokerToRustDef`
//! function; having it here means adding a new effect/variable type only requires
//! updating Rust, not both the TypeScript mapper and the Rust codegen.

use balatro_codegen::types::{
    AtlasPos, ConditionDef, ConditionGroupDef, DisplaySize, EffectDef, JokerDef, LogicOp,
    LoopGroupDef, ParamValue, RandomGroupDef, RuleDef, TypedValue, UserVarType,
    UserVariableDef,
};
use serde::Deserialize;
use serde_json::Value;
use std::collections::HashMap;

// ---------------------------------------------------------------------------
// Input types — match the TypeScript `JokerData` / `Rule` shapes exactly
// ---------------------------------------------------------------------------

/// Atlas position sent alongside joker data at export time.
#[derive(Debug, Clone, Deserialize)]
pub struct AtlasPosInput {
    pub x: i32,
    pub y: i32,
}

/// Mirrors the TypeScript `JokerData` interface.
///
/// Fields use their original TypeScript names (mix of camelCase and snake_case)
/// via individual `#[serde(rename)]` attributes where needed.
#[derive(Debug, Deserialize)]
pub struct JokerDataInput {
    #[serde(rename = "objectKey")]
    pub object_key: String,
    pub name: String,
    pub description: String,
    pub cost: i32,
    /// Can be a number (1–4) or string ("common" | "uncommon" | "rare" | "legendary").
    pub rarity: Value,
    #[serde(default)]
    pub blueprint_compat: Option<bool>,
    #[serde(default)]
    pub eternal_compat: Option<bool>,
    #[serde(default)]
    pub perishable_compat: Option<bool>,
    #[serde(default)]
    pub unlocked: Option<bool>,
    #[serde(default)]
    pub discovered: Option<bool>,
    /// Scale width as a percentage (100 = 1×). Used to compute `display_size`.
    #[serde(default)]
    pub scale_w: Option<f64>,
    /// Scale height as a percentage (100 = 1×).
    #[serde(default)]
    pub scale_h: Option<f64>,
    #[serde(default)]
    pub rules: Vec<RuleInput>,
    #[serde(rename = "userVariables", default)]
    pub user_variables: Vec<UserVariableInput>,
}

/// Mirrors the TypeScript `Rule` interface.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleInput {
    pub id: String,
    pub trigger: String,
    #[serde(default)]
    pub condition_groups: Vec<ConditionGroupInput>,
    #[serde(default)]
    pub effects: Vec<EffectInput>,
    #[serde(default)]
    pub random_groups: Vec<RandomGroupInput>,
    /// TypeScript field is `loops`, not `loopGroups`.
    #[serde(default)]
    pub loops: Vec<LoopGroupInput>,
}

/// Mirrors the TypeScript `ConditionGroup` interface.
#[derive(Debug, Deserialize)]
pub struct ConditionGroupInput {
    /// `"and"` | `"or"`
    pub operator: String,
    #[serde(default)]
    pub conditions: Vec<ConditionInput>,
}

/// Mirrors the TypeScript `Condition` interface.
#[derive(Debug, Deserialize)]
pub struct ConditionInput {
    #[serde(rename = "type")]
    pub condition_type: String,
    #[serde(default)]
    pub negate: bool,
    #[serde(default)]
    pub params: HashMap<String, WrappedParamInput>,
}

/// Mirrors the TypeScript `Effect` interface.
#[derive(Debug, Deserialize)]
pub struct EffectInput {
    #[serde(rename = "type")]
    pub effect_type: String,
    #[serde(default)]
    pub params: HashMap<String, WrappedParamInput>,
}

/// Mirrors the TypeScript `RandomGroup` interface.
#[derive(Debug, Deserialize)]
pub struct RandomGroupInput {
    pub id: String,
    pub chance_numerator: WrappedParamInput,
    pub chance_denominator: WrappedParamInput,
    #[serde(default)]
    pub effects: Vec<EffectInput>,
}

/// Mirrors the TypeScript `LoopGroup` interface.
#[derive(Debug, Deserialize)]
pub struct LoopGroupInput {
    pub id: String,
    /// TypeScript field is `repetitions`.
    pub repetitions: WrappedParamInput,
    #[serde(default)]
    pub effects: Vec<EffectInput>,
}

/// A raw TypeScript param value: `{ value: T, valueType?: string }`.
///
/// The TypeScript frontend stores all effect/condition params in this
/// wrapped form. `valueType` is present only for dynamic values
/// (game variables, user variables, ranges, etc.).
#[derive(Debug, Deserialize)]
pub struct WrappedParamInput {
    pub value: Value,
    #[serde(rename = "valueType", default)]
    pub value_type: Option<String>,
}

/// Mirrors the TypeScript `UserVariable` interface.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserVariableInput {
    pub name: String,
    #[serde(rename = "type")]
    pub var_type: String,
    pub initial_value: Option<f64>,
    pub initial_suit: Option<String>,
    pub initial_rank: Option<String>,
    pub initial_poker_hand: Option<String>,
    pub initial_key: Option<String>,
    pub initial_text: Option<String>,
}

/// A joker entry for `batch_export_jokers`.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchJokerEntry {
    pub joker_data: JokerDataInput,
    pub pos: AtlasPosInput,
    pub soul_pos: Option<AtlasPosInput>,
    /// Filename to write, e.g. `"j_my_joker.lua"`.
    pub file_name: String,
}

// ---------------------------------------------------------------------------
// Conversion — JokerDataInput → JokerDef
// ---------------------------------------------------------------------------

/// Convert raw `JokerDataInput` (from the TypeScript frontend) into a canonical
/// `JokerDef` suitable for `balatro_codegen::compile_joker_with_options`.
pub fn joker_data_to_def(
    input: &JokerDataInput,
    pos: AtlasPosInput,
    soul_pos: Option<AtlasPosInput>,
) -> JokerDef {
    JokerDef {
        key: input.object_key.clone(),
        name: input.name.clone(),
        description: split_description(&input.description),
        cost: input.cost,
        rarity: normalize_rarity(&input.rarity),
        blueprint_compat: input.blueprint_compat.unwrap_or(false),
        eternal_compat: input.eternal_compat.unwrap_or(false),
        perishable_compat: input.perishable_compat.unwrap_or(true),
        unlocked: input.unlocked.unwrap_or(true),
        discovered: input.discovered.unwrap_or(true),
        atlas: "CustomJokers".to_string(),
        pos: AtlasPos { x: pos.x, y: pos.y },
        soul_pos: soul_pos.map(|sp| AtlasPos { x: sp.x, y: sp.y }),
        display_size: compute_display_size(input.scale_w, input.scale_h),
        rules: input.rules.iter().map(map_rule).collect(),
        appearance: None,
        unlock: None,
        user_variables: input.user_variables.iter().map(map_user_variable).collect(),
    }
}

// ---------------------------------------------------------------------------
// Rule / condition / effect mappers
// ---------------------------------------------------------------------------

fn map_rule(rule: &RuleInput) -> RuleDef {
    RuleDef {
        id: rule.id.clone(),
        trigger: rule.trigger.clone(),
        condition_groups: rule.condition_groups.iter().map(map_condition_group).collect(),
        effects: rule.effects.iter().map(map_effect).collect(),
        random_groups: rule.random_groups.iter().map(map_random_group).collect(),
        loop_groups: rule.loops.iter().map(map_loop_group).collect(),
    }
}

fn map_condition_group(cg: &ConditionGroupInput) -> ConditionGroupDef {
    ConditionGroupDef {
        logic_operator: if cg.operator == "or" { LogicOp::Or } else { LogicOp::And },
        conditions: cg.conditions.iter().map(map_condition).collect(),
    }
}

fn map_condition(c: &ConditionInput) -> ConditionDef {
    ConditionDef {
        condition_type: c.condition_type.clone(),
        negate: c.negate,
        params: map_params(&c.params),
    }
}

fn map_effect(e: &EffectInput) -> EffectDef {
    EffectDef {
        effect_type: e.effect_type.clone(),
        params: map_params(&e.params),
    }
}

fn map_random_group(rg: &RandomGroupInput) -> RandomGroupDef {
    RandomGroupDef {
        id: rg.id.clone(),
        chance_numerator: wrapped_to_param(&rg.chance_numerator),
        chance_denominator: wrapped_to_param(&rg.chance_denominator),
        effects: rg.effects.iter().map(map_effect).collect(),
    }
}

fn map_loop_group(lg: &LoopGroupInput) -> LoopGroupDef {
    LoopGroupDef {
        id: lg.id.clone(),
        count: wrapped_to_param(&lg.repetitions),
        effects: lg.effects.iter().map(map_effect).collect(),
    }
}

fn map_params(params: &HashMap<String, WrappedParamInput>) -> HashMap<String, ParamValue> {
    params
        .iter()
        .map(|(k, v)| (k.clone(), wrapped_to_param(v)))
        .collect()
}

// ---------------------------------------------------------------------------
// User variable mapper
// ---------------------------------------------------------------------------

fn map_user_variable(v: &UserVariableInput) -> UserVariableDef {
    let var_type = match v.var_type.as_str() {
        "suit" => UserVarType::Suit,
        "rank" => UserVarType::Rank,
        "pokerhand" => UserVarType::PokerHand,
        "key" => UserVarType::Key,
        "text" => UserVarType::Text,
        _ => UserVarType::Number,
    };

    let initial_value = match v.var_type.as_str() {
        "suit" => ParamValue::Str(v.initial_suit.clone().unwrap_or_else(|| "Spades".into())),
        "rank" => ParamValue::Str(v.initial_rank.clone().unwrap_or_else(|| "Ace".into())),
        "pokerhand" => {
            ParamValue::Str(v.initial_poker_hand.clone().unwrap_or_else(|| "High Card".into()))
        }
        "key" => ParamValue::Str(v.initial_key.clone().unwrap_or_else(|| "none".into())),
        "text" => ParamValue::Str(v.initial_text.clone().unwrap_or_default()),
        _ => ParamValue::Float(v.initial_value.unwrap_or(0.0)),
    };

    UserVariableDef {
        name: v.name.clone(),
        var_type,
        initial_value,
    }
}

// ---------------------------------------------------------------------------
// Primitive helpers
// ---------------------------------------------------------------------------

/// Convert a `{ value, valueType? }` wrapped param into a `ParamValue`.
fn wrapped_to_param(w: &WrappedParamInput) -> ParamValue {
    if let Some(ref vt) = w.value_type {
        return ParamValue::Typed(TypedValue {
            value: w.value.clone(),
            value_type: vt.clone(),
        });
    }
    json_value_to_param(&w.value)
}

/// Convert a bare `serde_json::Value` to `ParamValue`.
fn json_value_to_param(v: &Value) -> ParamValue {
    match v {
        Value::Number(n) => n
            .as_i64()
            .map(ParamValue::Int)
            .unwrap_or_else(|| ParamValue::Float(n.as_f64().unwrap_or(0.0))),
        Value::Bool(b) => ParamValue::Bool(*b),
        Value::String(s) => ParamValue::Str(s.clone()),
        _ => ParamValue::Str(v.to_string()),
    }
}

/// Map a rarity value that is either a number (1–4) or a string to the
/// canonical lowercase string used by `balatro_codegen`.
fn normalize_rarity(rarity: &Value) -> String {
    match rarity {
        Value::String(s) => s.to_lowercase(),
        Value::Number(n) => match n.as_u64().unwrap_or(1) {
            2 => "uncommon",
            3 => "rare",
            4 => "legendary",
            _ => "common",
        }
        .to_string(),
        _ => "common".to_string(),
    }
}

/// Split an HTML-formatted description string into individual lines.
///
/// Mirrors the TypeScript `splitDescription` helper: replaces `<br>` variants
/// with newlines, trims each line, and filters empties. Falls back to
/// `["No description"]` if the result would be empty.
fn split_description(desc: &str) -> Vec<String> {
    // Handle common <br> variants case-insensitively without pulling in a regex dep
    let normalized = desc
        .replace("<br />", "\n")
        .replace("<br/>", "\n")
        .replace("<br>", "\n")
        .replace("<BR />", "\n")
        .replace("<BR/>", "\n")
        .replace("<BR>", "\n")
        .replace("[s]", "\n");

    let lines: Vec<String> = normalized
        .split('\n')
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect();

    if lines.is_empty() {
        vec!["No description".to_string()]
    } else {
        lines
    }
}

/// Compute an optional `DisplaySize` from `scale_w` / `scale_h` percentage values.
///
/// Returns `None` when both are effectively 1× (within floating-point epsilon),
/// matching the TypeScript `getDisplaySizeOverride` behaviour.
fn compute_display_size(scale_w: Option<f64>, scale_h: Option<f64>) -> Option<DisplaySize> {
    let w = scale_w.map(|v| v / 100.0).unwrap_or(1.0);
    let h = scale_h.map(|v| v / 100.0).unwrap_or(1.0);
    if (w - 1.0).abs() < 0.0001 && (h - 1.0).abs() < 0.0001 {
        None
    } else {
        Some(DisplaySize { w, h })
    }
}
