use std::collections::HashMap;

use super::types::RuleCatalogPayload;

pub struct NodeSchema {
    pub input_kinds: Vec<String>,
    pub output_kinds: Vec<String>,
}

pub struct SchemaRegistry {
    schemas: HashMap<String, NodeSchema>,
}

impl SchemaRegistry {
    pub fn from_catalog(catalog: &RuleCatalogPayload) -> Self {
        let mut schemas = HashMap::new();

        for entry in &catalog.triggers {
            if let Some(id) = entry.get("id").and_then(|value| value.as_str()) {
                schemas.insert(
                    format!("trigger.{id}"),
                    NodeSchema {
                        input_kinds: Vec::new(),
                        output_kinds: vec!["trigger".to_string()],
                    },
                );
            }
        }

        for entry in &catalog.conditions {
            if let Some(id) = entry.get("id").and_then(|value| value.as_str()) {
                schemas.insert(
                    format!("condition.{id}"),
                    NodeSchema {
                        input_kinds: vec!["trigger".to_string(), "condition".to_string()],
                        output_kinds: vec!["condition".to_string()],
                    },
                );
            }
        }

        for entry in &catalog.effects {
            if let Some(id) = entry.get("id").and_then(|value| value.as_str()) {
                schemas.insert(
                    format!("effect.{id}"),
                    NodeSchema {
                        input_kinds: vec![
                            "trigger".to_string(),
                            "condition".to_string(),
                            "effect".to_string(),
                        ],
                        output_kinds: vec!["effect".to_string()],
                    },
                );
            }
        }

        Self { schemas }
    }

    pub fn has_node_type(&self, node_type: &str) -> bool {
        self.schemas.contains_key(node_type)
    }

    pub fn resolve_node_type(&self, node_type: &str) -> Option<String> {
        if self.schemas.contains_key(node_type) {
            return Some(node_type.to_string());
        }

        ["trigger", "condition", "effect"]
            .iter()
            .map(|prefix| format!("{prefix}.{node_type}"))
            .find(|candidate| self.schemas.contains_key(candidate))
    }

    pub fn can_connect(&self, source_node_type: &str, target_node_type: &str) -> bool {
        let Some(source_schema) = self.schemas.get(source_node_type) else {
            return false;
        };
        let Some(target_schema) = self.schemas.get(target_node_type) else {
            return false;
        };

        source_schema
            .output_kinds
            .iter()
            .any(|output| target_schema.input_kinds.contains(output))
    }
}
