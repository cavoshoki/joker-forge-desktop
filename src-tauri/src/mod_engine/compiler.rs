use balatro_codegen::{compile_node_snippet, Emitter, ObjectType};

use super::types::{EntityState, Node, NodeCategory, SnippetResponse};

pub trait Compiler {
    fn compile_entity(&self, state: &EntityState) -> String;
    fn compile_node(
        &self,
        state: &EntityState,
        node: &Node,
        dependencies: &[Node],
    ) -> SnippetResponse;
}

/// Real compiler backed by the balatro-codegen crate.
pub struct BalatroCompiler;

impl BalatroCompiler {
    fn resolve_object_type(entity_type: &str) -> ObjectType {
        match entity_type {
            "joker" => ObjectType::Joker,
            "consumable" => ObjectType::Consumable,
            "card" => ObjectType::Card,
            "voucher" => ObjectType::Voucher,
            "deck" => ObjectType::Deck,
            _ => ObjectType::Joker,
        }
    }

    /// Convert the entity state graph into a JokerDef and compile it.
    fn compile_joker_entity(state: &EntityState) -> String {
        use balatro_codegen::types::*;

        // Extract rules from the graph.
        // Walk the node graph: triggers → conditions → effects.
        // Uses ParsedNodeType for safe, enum-based category dispatch.
        let trigger_nodes: Vec<&Node> = state
            .nodes
            .values()
            .filter(|n| {
                matches!(
                    n.parsed_type().map(|p| p.category),
                    Some(NodeCategory::Trigger)
                )
            })
            .collect();

        let mut rules: Vec<RuleDef> = Vec::new();

        for trigger_node in &trigger_nodes {
            let trigger_type = trigger_node
                .parsed_type()
                .map(|p| p.kind)
                .unwrap_or_else(|| trigger_node.node_type.clone());

            // Find all nodes downstream of this trigger
            let (conditions, effects) =
                collect_downstream(state, &trigger_node.id);

            let condition_groups = if conditions.is_empty() {
                vec![]
            } else {
                vec![ConditionGroupDef {
                    logic_operator: LogicOp::And,
                    conditions: conditions
                        .into_iter()
                        .map(|n| {
                            let kind = n
                                .parsed_type()
                                .map(|p| p.kind)
                                .unwrap_or_else(|| n.node_type.clone());
                            ConditionDef {
                                condition_type: kind,
                                negate: n
                                    .values
                                    .get("negate")
                                    .and_then(|v| v.as_bool())
                                    .unwrap_or(false),
                                params: convert_values(&n.values),
                            }
                        })
                        .collect(),
                }]
            };

            let effect_defs: Vec<EffectDef> = effects
                .into_iter()
                .map(|n| {
                    let kind = n
                        .parsed_type()
                        .map(|p| p.kind)
                        .unwrap_or_else(|| n.node_type.clone());
                    EffectDef {
                        effect_type: kind,
                        params: convert_values(&n.values),
                    }
                })
                .collect();

            rules.push(RuleDef {
                id: trigger_node.id.clone(),
                trigger: trigger_type,
                condition_groups,
                effects: effect_defs,
                random_groups: vec![],
                loop_groups: vec![],
            });
        }

        let joker = JokerDef {
            key: state.metadata.internal_id.clone(),
            name: state
                .metadata
                .internal_id
                .replace('_', " ")
                .to_string(),
            description: vec!["TODO: description".to_string()],
            cost: state.metadata.base_cost,
            rarity: state.metadata.rarity_tier.clone(),
            blueprint_compat: state.metadata.blueprint_compatible,
            eternal_compat: true,
            perishable_compat: true,
            unlocked: true,
            discovered: true,
            atlas: "CustomJokers".to_string(),
            pos: AtlasPos { x: 0, y: 0 },
            soul_pos: None,
            display_size: None,
            rules,
            appearance: None,
            unlock: None,
            user_variables: vec![],
        };

        let chunk = balatro_codegen::compile_joker(&joker, "mod");
        Emitter::new().emit_chunk(&chunk)
    }
}

impl Compiler for BalatroCompiler {
    fn compile_entity(&self, state: &EntityState) -> String {
        match state.entity_type.as_str() {
            "joker" => Self::compile_joker_entity(state),
            _ => format!(
                "-- code generation for '{}' entities is not yet implemented\nreturn {{}}",
                state.entity_type
            ),
        }
    }

    fn compile_node(
        &self,
        state: &EntityState,
        node: &Node,
        _dependencies: &[Node],
    ) -> SnippetResponse {
        let object_type = Self::resolve_object_type(&state.entity_type);

        let params: std::collections::HashMap<String, serde_json::Value> =
            node.values.clone();

        let code = compile_node_snippet(
            &node.node_type,
            &params,
            object_type,
            "mod",
        );

        let description = if let Some(p) = node.parsed_type() {
            let cat = match p.category {
                NodeCategory::Trigger => "Trigger",
                NodeCategory::Condition => "Condition",
                NodeCategory::Effect => "Effect",
            };
            format!("{} block: {}", cat, p.kind.replace('_', " "))
        } else {
            format!("Unknown block: {}", node.node_type.replace('_', " "))
        };

        SnippetResponse { code, description }
    }
}

/// Walk the graph downstream from a trigger, collecting condition and effect nodes.
///
/// Uses `Node::parsed_type()` for enum-based category dispatch rather than
/// `starts_with` string checks.
fn collect_downstream<'a>(
    state: &'a EntityState,
    start_id: &str,
) -> (Vec<&'a Node>, Vec<&'a Node>) {
    let mut conditions = Vec::new();
    let mut effects = Vec::new();
    let mut visited = std::collections::HashSet::new();
    let mut queue = vec![start_id.to_string()];

    while let Some(current_id) = queue.pop() {
        for edge in &state.edges {
            if edge.source_id == current_id && !visited.contains(&edge.target_id) {
                visited.insert(edge.target_id.clone());
                if let Some(target_node) = state.nodes.get(&edge.target_id) {
                    match target_node.parsed_type().map(|p| p.category) {
                        Some(NodeCategory::Condition) => conditions.push(target_node),
                        Some(NodeCategory::Effect) => effects.push(target_node),
                        _ => {}
                    }
                    queue.push(edge.target_id.clone());
                }
            }
        }
    }

    (conditions, effects)
}

/// Convert node values to ParamValue format.
fn convert_values(
    values: &std::collections::HashMap<String, serde_json::Value>,
) -> std::collections::HashMap<String, balatro_codegen::types::ParamValue> {
    values
        .iter()
        .map(|(k, v)| {
            let pv = match v {
                serde_json::Value::Number(n) => {
                    if let Some(i) = n.as_i64() {
                        balatro_codegen::types::ParamValue::Int(i)
                    } else {
                        balatro_codegen::types::ParamValue::Float(
                            n.as_f64().unwrap_or(0.0),
                        )
                    }
                }
                serde_json::Value::Bool(b) => {
                    balatro_codegen::types::ParamValue::Bool(*b)
                }
                serde_json::Value::String(s) => {
                    balatro_codegen::types::ParamValue::Str(s.clone())
                }
                _ => balatro_codegen::types::ParamValue::Str(v.to_string()),
            };
            (k.clone(), pv)
        })
        .collect()
}

// `capitalize` removed — category labels now come from the NodeCategory match arm strings.
