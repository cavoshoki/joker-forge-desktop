use crate::compiler;
use crate::lua_ast::Chunk;
use crate::types::{RarityDef, ObjectType};
use super::GameObject;

impl GameObject for RarityDef {
    fn object_type(&self) -> ObjectType {
        ObjectType::Rarity
    }

    fn compile(&self, mod_prefix: &str) -> Chunk {
        compiler::compile_rarity(self, mod_prefix)
    }
}
