use super::types::{EntityState, Node, SnippetResponse};

pub trait Compiler {
    fn compile_entity(&self, state: &EntityState) -> String;
    fn compile_node(
        &self,
        state: &EntityState,
        node: &Node,
        dependencies: &[Node],
    ) -> SnippetResponse;
}

pub struct MockCompiler;

impl Compiler for MockCompiler {
    fn compile_entity(&self, state: &EntityState) -> String {
        format!(
            "-- mock lua output\n-- entity: {}\n-- nodes: {}\n-- edges: {}\nreturn {}",
            state.entity_type,
            state.nodes.len(),
            state.edges.len(),
            "{}"
        )
    }

    fn compile_node(
        &self,
        state: &EntityState,
        node: &Node,
        dependencies: &[Node],
    ) -> SnippetResponse {
        let deps = dependencies
            .iter()
            .map(|entry| entry.id.as_str())
            .collect::<Vec<_>>()
            .join(", ");

        SnippetResponse {
            code: format!(
                "-- mock lua snippet\n-- entity: {}\n-- node: {}\n-- node_type: {}\n-- dependencies: [{}]\nreturn true",
                state.entity_type, node.id, node.node_type, deps
            ),
            description: format!(
                "This block is a '{}' node for '{}' entities. It currently returns mocked compilation output and includes direct input dependencies for learning mode.",
                node.node_type, state.entity_type
            ),
        }
    }
}
