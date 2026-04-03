use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

// ---------------------------------------------------------------------------
// Typed node category — replaces stringly-typed `starts_with("trigger.")` checks
// ---------------------------------------------------------------------------

/// The categorical role of a graph node.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NodeCategory {
    Trigger,
    Condition,
    Effect,
}

/// A fully-parsed node type string: category (`"trigger"`) + specific kind (`"hand_played"`).
///
/// Created by `Node::parsed_type()`. Pattern-match on `category` instead of calling
/// `node_type.starts_with("trigger.")` throughout the compiler.
#[derive(Debug, Clone)]
pub struct ParsedNodeType {
    pub category: NodeCategory,
    /// The specific kind, e.g. `"hand_played"` from `"trigger.hand_played"`.
    pub kind: String,
}

impl ParsedNodeType {
    /// Parse a `"category.kind"` string. Returns `None` for unknown categories or
    /// malformed strings (no dot separator).
    pub fn from_str(node_type: &str) -> Option<Self> {
        let (prefix, rest) = node_type.split_once('.')?;
        let category = match prefix {
            "trigger" => NodeCategory::Trigger,
            "condition" => NodeCategory::Condition,
            "effect" => NodeCategory::Effect,
            _ => return None,
        };
        Some(Self {
            category,
            kind: rest.to_string(),
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EntityMetadata {
    pub internal_id: String,
    pub base_cost: i32,
    pub rarity_tier: String,
    pub blueprint_compatible: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Node {
    pub id: String,
    pub node_type: String,
    pub values: HashMap<String, Value>,
}

impl Node {
    /// Parse `node_type` into a structured `ParsedNodeType`.
    ///
    /// Returns `None` for nodes with unknown or malformed categories.
    pub fn parsed_type(&self) -> Option<ParsedNodeType> {
        ParsedNodeType::from_str(&self.node_type)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Edge {
    pub source_id: String,
    pub target_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EntityState {
    pub entity_type: String,
    pub metadata: EntityMetadata,
    pub nodes: HashMap<String, Node>,
    pub edges: Vec<Edge>,
}

impl EntityState {
    pub fn new(entity_type: String) -> Self {
        Self {
            metadata: EntityMetadata {
                internal_id: format!("{}_entity", entity_type.to_lowercase()),
                base_cost: 0,
                rarity_tier: "common".to_string(),
                blueprint_compatible: false,
            },
            entity_type,
            nodes: HashMap::new(),
            edges: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnippetResponse {
    pub code: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StateSyncPayload {
    pub entity_type: String,
    pub metadata: EntityMetadata,
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuleCatalogPayload {
    pub triggers: Vec<Value>,
    pub conditions: Vec<Value>,
    pub effects: Vec<Value>,
    pub generic_triggers: Vec<String>,
    pub all_objects: Vec<String>,
    pub trigger_groups: HashMap<String, Vec<String>>,
    pub option_sources: HashMap<String, String>,
    pub option_sets: HashMap<String, Vec<Value>>,
}

impl From<&EntityState> for StateSyncPayload {
    fn from(value: &EntityState) -> Self {
        Self {
            entity_type: value.entity_type.clone(),
            metadata: value.metadata.clone(),
            nodes: value.nodes.values().cloned().collect(),
            edges: value.edges.clone(),
        }
    }
}
