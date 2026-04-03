use std::collections::HashMap;

use serde_json::Value;
use tauri::{Emitter, State, Window};

use super::{
    compiler::Compiler,
    state::AppState,
    types::{Edge, EntityState, Node, RuleCatalogPayload, SnippetResponse, StateSyncPayload},
};

fn emit_sync(window: &Window, compiler: &impl Compiler, state: &EntityState) -> Result<(), String> {
    let payload = StateSyncPayload::from(state);
    let code = compiler.compile_entity(state);
    window
        .emit("state_sync", payload)
        .map_err(|error| error.to_string())?;
    window
        .emit("live_code_update", code)
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn init_entity(
    entity_type: String,
    app_state: State<'_, AppState>,
    window: Window,
) -> Result<StateSyncPayload, String> {
    let state_snapshot = {
        let mut state = app_state
            .entity_state
            .lock()
            .map_err(|_| "Failed to lock entity state".to_string())?;
        *state = EntityState::new(entity_type);
        state.clone()
    };

    emit_sync(&window, &app_state.compiler, &state_snapshot)?;
    Ok(StateSyncPayload::from(&state_snapshot))
}

#[tauri::command]
pub fn add_node(
    node_type: String,
    id: String,
    app_state: State<'_, AppState>,
    window: Window,
) -> Result<StateSyncPayload, String> {
    let normalized_node_type = app_state
        .registry
        .resolve_node_type(&node_type)
        .ok_or_else(|| format!("Unknown node type: {}", node_type))?;

    if !app_state.registry.has_node_type(&normalized_node_type) {
        return Err(format!("Unknown node type: {}", node_type));
    }

    let state_snapshot = {
        let mut state = app_state
            .entity_state
            .lock()
            .map_err(|_| "Failed to lock entity state".to_string())?;

        if state.nodes.contains_key(&id) {
            return Err(format!("Node already exists: {}", id));
        }

        let node = Node {
            id: id.clone(),
            node_type: normalized_node_type,
            values: HashMap::new(),
        };

        state.nodes.insert(id, node);
        state.clone()
    };

    emit_sync(&window, &app_state.compiler, &state_snapshot)?;
    Ok(StateSyncPayload::from(&state_snapshot))
}

#[tauri::command]
pub fn get_rulebuilder_catalog(
    app_state: State<'_, AppState>,
) -> Result<RuleCatalogPayload, String> {
    Ok(app_state.rule_catalog.clone())
}

#[tauri::command]
pub fn remove_node(
    id: String,
    app_state: State<'_, AppState>,
    window: Window,
) -> Result<StateSyncPayload, String> {
    let state_snapshot = {
        let mut state = app_state
            .entity_state
            .lock()
            .map_err(|_| "Failed to lock entity state".to_string())?;

        if state.nodes.remove(&id).is_none() {
            return Err(format!("Node does not exist: {}", id));
        }

        state
            .edges
            .retain(|edge| edge.source_id != id && edge.target_id != id);
        state.clone()
    };

    emit_sync(&window, &app_state.compiler, &state_snapshot)?;
    Ok(StateSyncPayload::from(&state_snapshot))
}

#[tauri::command]
pub fn connect_nodes(
    source_id: String,
    target_id: String,
    app_state: State<'_, AppState>,
    window: Window,
) -> Result<StateSyncPayload, String> {
    let state_snapshot = {
        let mut state = app_state
            .entity_state
            .lock()
            .map_err(|_| "Failed to lock entity state".to_string())?;

        let source = state
            .nodes
            .get(&source_id)
            .ok_or_else(|| format!("Source node does not exist: {}", source_id))?
            .clone();
        let target = state
            .nodes
            .get(&target_id)
            .ok_or_else(|| format!("Target node does not exist: {}", target_id))?
            .clone();

        if !app_state
            .registry
            .can_connect(&source.node_type, &target.node_type)
        {
            return Err(format!(
                "Schema validation failed for connection {} -> {}",
                source.node_type, target.node_type
            ));
        }

        let edge = Edge {
            source_id: source_id.clone(),
            target_id: target_id.clone(),
        };

        if !state.edges.contains(&edge) {
            state.edges.push(edge);
        }

        state.clone()
    };

    emit_sync(&window, &app_state.compiler, &state_snapshot)?;
    Ok(StateSyncPayload::from(&state_snapshot))
}

#[tauri::command]
pub fn disconnect_nodes(
    source_id: String,
    target_id: String,
    app_state: State<'_, AppState>,
    window: Window,
) -> Result<StateSyncPayload, String> {
    let state_snapshot = {
        let mut state = app_state
            .entity_state
            .lock()
            .map_err(|_| "Failed to lock entity state".to_string())?;

        let original_len = state.edges.len();
        state
            .edges
            .retain(|edge| !(edge.source_id == source_id && edge.target_id == target_id));

        if state.edges.len() == original_len {
            return Err(format!(
                "Connection does not exist: {} -> {}",
                source_id, target_id
            ));
        }

        state.clone()
    };

    emit_sync(&window, &app_state.compiler, &state_snapshot)?;
    Ok(StateSyncPayload::from(&state_snapshot))
}

#[tauri::command]
pub fn update_node_value(
    id: String,
    field: String,
    value: Value,
    app_state: State<'_, AppState>,
    window: Window,
) -> Result<StateSyncPayload, String> {
    let state_snapshot = {
        let mut state = app_state
            .entity_state
            .lock()
            .map_err(|_| "Failed to lock entity state".to_string())?;

        let node = state
            .nodes
            .get_mut(&id)
            .ok_or_else(|| format!("Node does not exist: {}", id))?;
        node.values.insert(field, value);

        state.clone()
    };

    emit_sync(&window, &app_state.compiler, &state_snapshot)?;
    Ok(StateSyncPayload::from(&state_snapshot))
}

#[tauri::command]
pub fn get_node_snippet(
    node_id: String,
    app_state: State<'_, AppState>,
) -> Result<SnippetResponse, String> {
    let state = app_state
        .entity_state
        .lock()
        .map_err(|_| "Failed to lock entity state".to_string())?;

    let node = state
        .nodes
        .get(&node_id)
        .ok_or_else(|| format!("Node does not exist: {}", node_id))?
        .clone();

    let dependencies = state
        .edges
        .iter()
        .filter(|edge| edge.target_id == node_id)
        .filter_map(|edge| state.nodes.get(&edge.source_id).cloned())
        .collect::<Vec<_>>();

    Ok(app_state
        .compiler
        .compile_node(&state, &node, &dependencies))
}
