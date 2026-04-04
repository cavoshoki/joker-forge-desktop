use crate::compiler;
use crate::lua_ast::Chunk;
use crate::types::{EditionDef, ObjectType};
use super::GameObject;

impl GameObject for EditionDef {
    fn object_type(&self) -> ObjectType {
        ObjectType::Edition
    }

    fn compile(&self, mod_prefix: &str) -> Chunk {
        compiler::compile_edition(self, mod_prefix)
    }
}
