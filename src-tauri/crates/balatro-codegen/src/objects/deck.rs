use crate::compiler;
use crate::lua_ast::Chunk;
use crate::types::{DeckDef, ObjectType};
use super::GameObject;

impl GameObject for DeckDef {
    fn object_type(&self) -> ObjectType {
        ObjectType::Deck
    }

    fn compile(&self, mod_prefix: &str) -> Chunk {
        compiler::compile_deck(self, mod_prefix)
    }
}
