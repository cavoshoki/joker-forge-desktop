use crate::compiler;
use crate::lua_ast::Chunk;
use crate::types::{EnhancementDef, ObjectType};
use super::GameObject;

impl GameObject for EnhancementDef {
    fn object_type(&self) -> ObjectType {
        ObjectType::Enhancement
    }

    fn compile(&self, mod_prefix: &str) -> Chunk {
        compiler::compile_enhancement(self, mod_prefix)
    }
}
