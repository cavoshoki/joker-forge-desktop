use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ---------------------------------------------------------------------------
// Top-level mod configuration
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModConfig {
    pub mod_prefix: String,
    pub mod_id: String,
    pub mod_name: String,
    pub mod_version: String,
    pub mod_author: String,
}

// ---------------------------------------------------------------------------
// Game object definitions
// ---------------------------------------------------------------------------

/// The type of game object being compiled.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ObjectType {
    Joker,
    Consumable,
    Card,
    Voucher,
    Deck,
}

impl ObjectType {
    pub fn as_str(&self) -> &'static str {
        match self {
            ObjectType::Joker => "joker",
            ObjectType::Consumable => "consumable",
            ObjectType::Card => "card",
            ObjectType::Voucher => "voucher",
            ObjectType::Deck => "deck",
        }
    }

    /// The Lua path prefix to access config variables for this object type.
    pub fn ability_path(&self) -> &'static str {
        match self {
            ObjectType::Deck => "back.ability.extra",
            _ => "card.ability.extra",
        }
    }
}

// ---------------------------------------------------------------------------
// Joker definition
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JokerDef {
    pub key: String,
    pub name: String,
    pub description: Vec<String>,
    pub cost: i32,
    pub rarity: String,
    pub blueprint_compat: bool,
    pub eternal_compat: bool,
    pub perishable_compat: bool,
    pub unlocked: bool,
    pub discovered: bool,
    pub atlas: String,
    pub pos: AtlasPos,
    #[serde(default)]
    pub soul_pos: Option<AtlasPos>,
    #[serde(default)]
    pub display_size: Option<DisplaySize>,
    pub rules: Vec<RuleDef>,
    #[serde(default)]
    pub appearance: Option<AppearanceDef>,
    #[serde(default)]
    pub unlock: Option<UnlockDef>,
    #[serde(default)]
    pub user_variables: Vec<UserVariableDef>,
    #[serde(default)]
    pub force_eternal: bool,
    #[serde(default)]
    pub force_perishable: bool,
    #[serde(default)]
    pub force_rental: bool,
    #[serde(default)]
    pub force_foil: bool,
    #[serde(default)]
    pub force_holographic: bool,
    #[serde(default)]
    pub force_polychrome: bool,
    #[serde(default)]
    pub force_negative: bool,
    #[serde(default)]
    pub ignore_slot_limit: bool,
    #[serde(default)]
    pub info_queues: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AtlasPos {
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DisplaySize {
    pub w: f64,
    pub h: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppearanceDef {
    #[serde(default)]
    pub appears_in: Vec<String>,
    #[serde(default)]
    pub not_appears_in: Vec<String>,
    #[serde(default)]
    pub appear_flags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnlockDef {
    pub condition: String,
    pub description: Vec<String>,
}

// ---------------------------------------------------------------------------
// User variables
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserVariableDef {
    pub name: String,
    pub var_type: UserVarType,
    pub initial_value: ParamValue,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum UserVarType {
    Number,
    Suit,
    Rank,
    PokerHand,
    Key,
    Text,
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuleDef {
    pub id: String,
    pub trigger: String,
    #[serde(default)]
    pub retrigger: bool,
    #[serde(default)]
    pub destroy: bool,
    #[serde(default)]
    pub condition_groups: Vec<ConditionGroupDef>,
    #[serde(default)]
    pub effects: Vec<EffectDef>,
    #[serde(default)]
    pub random_groups: Vec<RandomGroupDef>,
    #[serde(default)]
    pub loop_groups: Vec<LoopGroupDef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConditionGroupDef {
    #[serde(default = "default_logic_op")]
    pub logic_operator: LogicOp,
    pub conditions: Vec<ConditionDef>,
}

fn default_logic_op() -> LogicOp {
    LogicOp::And
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LogicOp {
    And,
    Or,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConditionDef {
    pub condition_type: String,
    #[serde(default)]
    pub negate: bool,
    #[serde(default)]
    pub operator: Option<LogicOp>,
    #[serde(default)]
    pub params: HashMap<String, ParamValue>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EffectDef {
    pub effect_type: String,
    #[serde(default)]
    pub params: HashMap<String, ParamValue>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RandomGroupDef {
    pub id: String,
    pub chance_numerator: ParamValue,
    pub chance_denominator: ParamValue,
    pub effects: Vec<EffectDef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoopGroupDef {
    pub id: String,
    pub count: ParamValue,
    pub effects: Vec<EffectDef>,
}

// ---------------------------------------------------------------------------
// Parameter values — flexible value type
// ---------------------------------------------------------------------------

/// A parameter value from the editor. Can be a plain literal or a dynamic
/// reference (game variable, user variable, range).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ParamValue {
    Int(i64),
    Float(f64),
    Bool(bool),
    Str(String),
    /// Complex value with type annotation
    Typed(TypedValue),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TypedValue {
    pub value: serde_json::Value,
    #[serde(rename = "valueType")]
    pub value_type: String,
}

impl ParamValue {
    pub fn as_str(&self) -> Option<&str> {
        match self {
            ParamValue::Str(s) => Some(s),
            _ => None,
        }
    }

    pub fn as_i64(&self) -> Option<i64> {
        match self {
            ParamValue::Int(n) => Some(*n),
            ParamValue::Float(n) => Some(*n as i64),
            _ => None,
        }
    }

    pub fn as_f64(&self) -> Option<f64> {
        match self {
            ParamValue::Float(n) => Some(*n),
            ParamValue::Int(n) => Some(*n as f64),
            _ => None,
        }
    }

    pub fn as_bool(&self) -> Option<bool> {
        match self {
            ParamValue::Bool(b) => Some(*b),
            _ => None,
        }
    }

    /// Get string value, trying string first, then converting other types.
    pub fn to_string_lossy(&self) -> String {
        match self {
            ParamValue::Str(s) => s.clone(),
            ParamValue::Int(n) => n.to_string(),
            ParamValue::Float(n) => n.to_string(),
            ParamValue::Bool(b) => b.to_string(),
            ParamValue::Typed(t) => t.value.as_str().map(|s| s.to_string()).unwrap_or_default(),
        }
    }
}

// ---------------------------------------------------------------------------
// Config variable — tracked during compilation
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct ConfigVar {
    pub name: String,
    pub value: ConfigValue,
}

#[derive(Debug, Clone)]
pub enum ConfigValue {
    Number(f64),
    Int(i64),
    Str(String),
    Bool(bool),
}

impl ConfigValue {
    pub fn to_lua_expr(&self) -> crate::lua_ast::Expr {
        use crate::lua_ast;
        match self {
            ConfigValue::Number(n) => lua_ast::lua_num(*n),
            ConfigValue::Int(n) => lua_ast::lua_int(*n),
            ConfigValue::Str(s) => lua_ast::lua_str(s),
            ConfigValue::Bool(b) => lua_ast::lua_bool(*b),
        }
    }
}
