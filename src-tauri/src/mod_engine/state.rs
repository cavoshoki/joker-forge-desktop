use std::sync::Mutex;

use super::{
    catalog::load_rule_catalog,
    compiler::BalatroCompiler,
    registry::SchemaRegistry,
    types::{EntityState, RuleCatalogPayload},
};

pub struct AppState {
    pub entity_state: Mutex<EntityState>,
    pub registry: SchemaRegistry,
    pub compiler: BalatroCompiler,
    pub rule_catalog: RuleCatalogPayload,
}

impl AppState {
    pub fn new() -> Result<Self, String> {
        let rule_catalog = load_rule_catalog()?;
        let registry = SchemaRegistry::from_catalog(&rule_catalog);

        Ok(Self {
            entity_state: Mutex::new(EntityState::new("joker".to_string())),
            registry,
            compiler: BalatroCompiler,
            rule_catalog,
        })
    }
}
