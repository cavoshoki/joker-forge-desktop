use crate::compiler;
use crate::lua_ast::Chunk;
use crate::types::{ConsumableDef, ObjectType};
use super::GameObject;

impl GameObject for ConsumableDef {
    fn object_type(&self) -> ObjectType {
        ObjectType::Consumable
    }

    fn compile(&self, mod_prefix: &str) -> Chunk {
        compiler::compile_consumable(self, mod_prefix)
    }
}
