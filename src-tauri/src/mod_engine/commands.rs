use std::{collections::HashMap, fs, path::Path};

use balatro_codegen::{
    compile_joker_with_options, compile_node_snippet, format_lua_source,
    Emitter as LuaEmitter, JokerDef, ObjectType,
};
use serde_json::Value;
use tauri::{Emitter, State, Window};

use super::{
    compiler::Compiler,
    export::{AtlasPosInput, BatchJokerEntry, JokerDataInput, ModMetadataInput},
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

#[tauri::command]
pub fn compile_joker_lua(joker_def: JokerDef, mod_prefix: String) -> Result<String, String> {
    let chunk = compile_joker_with_options(&joker_def, &mod_prefix, true);
    let lua = format_lua_source(&LuaEmitter::new().emit_chunk(&chunk));
    Ok(lua)
}

#[tauri::command]
pub fn compile_joker_lua_with_options(
    joker_def: JokerDef,
    mod_prefix: String,
    include_loc_txt: bool,
) -> Result<String, String> {
    let chunk = compile_joker_with_options(&joker_def, &mod_prefix, include_loc_txt);
    let lua = format_lua_source(&LuaEmitter::new().emit_chunk(&chunk));
    Ok(lua)
}

#[tauri::command]
pub fn compile_rulebuilder_node_snippet(
    item_type: String,
    node_type: String,
    params: HashMap<String, Value>,
) -> Result<String, String> {
    let object_type = match item_type.as_str() {
        "joker" => ObjectType::Joker,
        "consumable" => ObjectType::Consumable,
        "consumable_type" => ObjectType::ConsumableType,
        "enhancement" | "card" => ObjectType::Enhancement,
        "seal" => ObjectType::Seal,
        "edition" => ObjectType::Edition,
        "rarity" => ObjectType::Rarity,
        "voucher" => ObjectType::Voucher,
        "deck" => ObjectType::Deck,
        "booster" => ObjectType::Booster,
        _ => {
            return Err(format!("Unsupported item type: {}", item_type));
        }
    };

    Ok(compile_node_snippet(
        &node_type,
        &params,
        object_type,
        "mod",
    ))
}

// ---------------------------------------------------------------------------
// Unified export commands (Issue #1 + #2)
//
// These replace the TypeScript `mapJokerToRustDef` + per-joker IPC loop.
// The frontend sends raw `JokerData` objects; Rust maps them to `JokerDef`
// (via `export::joker_data_to_def`) and either returns the Lua source or
// writes it directly to disk, both in a single round-trip.
// ---------------------------------------------------------------------------

/// Compile a single joker from raw frontend data.
///
/// Accepts the unmodified TypeScript `JokerData` object. The Rust `export`
/// module handles all normalisation (rarity, description splitting: display
/// size: user variables) that was previously done by the TypeScript
/// `mapJokerToRustDef` helper.
#[tauri::command]
pub fn compile_joker_from_data(
    joker_data: JokerDataInput,
    pos: AtlasPosInput,
    soul_pos: Option<AtlasPosInput>,
    mod_prefix: String,
    include_loc_txt: bool,
) -> Result<String, String> {
    let joker_def = super::export::joker_data_to_def(&joker_data, pos, soul_pos);
    let chunk = compile_joker_with_options(&joker_def, &mod_prefix, include_loc_txt);
    Ok(format_lua_source(&LuaEmitter::new().emit_chunk(&chunk)))
}

/// Compile and write a batch of jokers to disk in a single IPC call.
///
/// Replaces the TypeScript `for (const joker of sorted)` loop that called
/// `compile_joker_lua_with_options` then `writeTextFile` once per joker.
/// Moving both steps here eliminates N round-trips across the Tauri bridge and
/// removes `mapJokerToRustDef` / `mapRules` from the TypeScript layer entirely.
///
/// The `joker_folder_path` directory must already exist (TypeScript still owns
/// directory scaffolding via the Tauri FS plugin).
///
/// Returns the number of files written.
#[tauri::command]
pub fn batch_export_jokers(
    joker_folder_path: String,
    mod_prefix: String,
    jokers: Vec<BatchJokerEntry>,
    include_loc_txt: bool,
) -> Result<usize, String> {
    let folder = std::path::Path::new(&joker_folder_path);
    let mut count = 0;

    for entry in &jokers {
        let lua = if let Some(custom) = &entry.custom_lua {
            custom.clone()
        } else {
            let joker_def =
                super::export::joker_data_to_def(&entry.joker_data, entry.pos.clone(), entry.soul_pos.clone());
            let chunk = compile_joker_with_options(&joker_def, &mod_prefix, include_loc_txt);
            format_lua_source(&LuaEmitter::new().emit_chunk(&chunk))
        };

        let path = folder.join(&entry.file_name);
        std::fs::write(&path, lua.as_bytes())
            .map_err(|e| format!("Failed to write {}: {}", entry.file_name, e))?;
        count += 1;
    }

    Ok(count)
}

/// Export a full mod package (main file, metadata JSON, atlas assets, jokers: localization)
/// in a single Rust command.
#[tauri::command]
pub fn export_mod_package(
    mod_folder_path: String,
    metadata: ModMetadataInput,
    jokers: Vec<BatchJokerEntry>,
    include_loc_txt: bool,
    use_localization_file: bool,
    localization_locale: Option<String>,
    atlas_1x_png: Option<Vec<u8>>,
    atlas_2x_png: Option<Vec<u8>>,
) -> Result<usize, String> {
    let root = Path::new(&mod_folder_path);
    fs::create_dir_all(root)
        .map_err(|e| format!("Failed to create mod folder {}: {}", mod_folder_path, e))?;

    let mut file_count = 0;

    let main_path = root.join(&metadata.main_file);
    let main_lua = format_lua_source(&super::export::build_main_lua(&jokers));
    fs::write(&main_path, main_lua.as_bytes())
        .map_err(|e| format!("Failed to write {}: {}", main_path.display(), e))?;
    file_count += 1;

    let json_path = root.join(format!("{}.json", metadata.id));
    let mod_json = super::export::build_mod_json(&metadata)?;
    fs::write(&json_path, mod_json.as_bytes())
        .map_err(|e| format!("Failed to write {}: {}", json_path.display(), e))?;
    file_count += 1;

    if let Some(bytes) = atlas_1x_png {
        let path = root.join("assets").join("1x").join("CustomJokers.png");
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create {}: {}", parent.display(), e))?;
        }
        fs::write(&path, bytes)
            .map_err(|e| format!("Failed to write {}: {}", path.display(), e))?;
        file_count += 1;
    }

    if let Some(bytes) = atlas_2x_png {
        let path = root.join("assets").join("2x").join("CustomJokers.png");
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create {}: {}", parent.display(), e))?;
        }
        fs::write(&path, bytes)
            .map_err(|e| format!("Failed to write {}: {}", path.display(), e))?;
        file_count += 1;
    }

    let joker_dir = root.join("jokers");
    fs::create_dir_all(&joker_dir)
        .map_err(|e| format!("Failed to create {}: {}", joker_dir.display(), e))?;

    for entry in &jokers {
        let lua = if let Some(custom) = &entry.custom_lua {
            custom.clone()
        } else {
            let joker_def =
                super::export::joker_data_to_def(&entry.joker_data, entry.pos.clone(), entry.soul_pos.clone());
            let chunk = compile_joker_with_options(&joker_def, &metadata.prefix, include_loc_txt);
            format_lua_source(&LuaEmitter::new().emit_chunk(&chunk))
        };

        let path = joker_dir.join(&entry.file_name);
        fs::write(&path, lua.as_bytes())
            .map_err(|e| format!("Failed to write {}: {}", path.display(), e))?;
        file_count += 1;
    }

    if use_localization_file {
        let locale = localization_locale.unwrap_or_else(|| "en-us".to_string());
        let localization_dir = root.join("localization");
        fs::create_dir_all(&localization_dir)
            .map_err(|e| format!("Failed to create {}: {}", localization_dir.display(), e))?;
        let loc_path = localization_dir.join(format!("{}.lua", locale));
        let loc_lua = format_lua_source(&super::export::build_localization_lua(&metadata.prefix, &jokers));
        fs::write(&loc_path, loc_lua.as_bytes())
            .map_err(|e| format!("Failed to write {}: {}", loc_path.display(), e))?;
        file_count += 1;
    }

    Ok(file_count)
}

