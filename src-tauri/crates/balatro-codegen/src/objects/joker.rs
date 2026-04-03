use crate::compiler;
use crate::lua_ast::Chunk;
use crate::types::{JokerDef, ObjectType};
use super::GameObject;

impl GameObject for JokerDef {
    fn object_type(&self) -> ObjectType {
        ObjectType::Joker
    }

    fn compile(&self, mod_prefix: &str) -> Chunk {
        compiler::compile_joker(self, mod_prefix)
    }
}
