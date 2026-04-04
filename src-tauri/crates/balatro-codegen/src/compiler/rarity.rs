use crate::lua_ast::*;
use crate::types::*;

/// Compile a rarity definition into a Lua chunk.
pub fn compile_rarity(rarity: &RarityDef, _mod_prefix: &str) -> Chunk {
    let hex = rarity.badge_colour.trim_start_matches('#');

    let mut entries: Vec<TableEntry> = Vec::new();
    entries.push(kv("key", lua_str(&rarity.key)));
    entries.push(kv("badge_colour", lua_call("HEX", vec![lua_str(hex)])));
    entries.push(kv("default_weight", lua_num(rarity.default_weight)));

    let loc_txt = lua_table(vec![("name", lua_str(&rarity.name))]);
    entries.push(TableEntry::KeyValue("loc_txt".to_string(), loc_txt));

    let smods_call = Stmt::ExprStmt(lua_table_call(
        lua_path(&["SMODS", "Rarity"]),
        entries,
    ));

    Chunk {
        stmts: vec![
            lua_comment(format!(" Rarity: {}", rarity.name)),
            smods_call,
        ],
    }
}

fn kv(key: &str, val: Expr) -> TableEntry {
    TableEntry::KeyValue(key.to_string(), val)
}
