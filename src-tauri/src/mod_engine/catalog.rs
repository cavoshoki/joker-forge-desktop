use serde_json::Value;

use super::types::RuleCatalogPayload;

const TRIGGERS_JSON: &str = include_str!("catalog/triggers.json");
const CONDITIONS_JSON: &str = include_str!("catalog/conditions.json");
const EFFECTS_JSON: &str = include_str!("catalog/effects.json");
const COMMON_JSON: &str = include_str!("catalog/common.json");

pub fn load_rule_catalog() -> Result<RuleCatalogPayload, String> {
    let triggers = serde_json::from_str::<Value>(TRIGGERS_JSON)
        .map_err(|error| error.to_string())?
        .as_array()
        .cloned()
        .ok_or_else(|| "Invalid triggers catalog data".to_string())?;

    let conditions = serde_json::from_str::<Value>(CONDITIONS_JSON)
        .map_err(|error| error.to_string())?
        .as_array()
        .cloned()
        .ok_or_else(|| "Invalid conditions catalog data".to_string())?;

    let effects = serde_json::from_str::<Value>(EFFECTS_JSON)
        .map_err(|error| error.to_string())?
        .as_array()
        .cloned()
        .ok_or_else(|| "Invalid effects catalog data".to_string())?;

    let common = serde_json::from_str::<Value>(COMMON_JSON).map_err(|error| error.to_string())?;

    let generic_triggers = common
        .get("genericTriggers")
        .and_then(Value::as_array)
        .ok_or_else(|| "Invalid generic triggers catalog data".to_string())?
        .iter()
        .filter_map(Value::as_str)
        .map(str::to_string)
        .collect::<Vec<_>>();

    let all_objects = common
        .get("allObjects")
        .and_then(Value::as_array)
        .ok_or_else(|| "Invalid all objects catalog data".to_string())?
        .iter()
        .filter_map(Value::as_str)
        .map(str::to_string)
        .collect::<Vec<_>>();

    let trigger_groups = common
        .get("triggerGroups")
        .and_then(Value::as_object)
        .map(|groups| {
            groups
                .iter()
                .map(|(group, entries)| {
                    let values = entries
                        .as_array()
                        .map(|list| {
                            list.iter()
                                .filter_map(Value::as_str)
                                .map(str::to_string)
                                .collect::<Vec<_>>()
                        })
                        .unwrap_or_default();
                    (group.to_string(), values)
                })
                .collect::<std::collections::HashMap<_, _>>()
        })
        .unwrap_or_default();

    let option_sources = common
        .get("optionSources")
        .and_then(Value::as_object)
        .map(|sources| {
            sources
                .iter()
                .filter_map(|(key, value)| {
                    value
                        .as_str()
                        .map(|text| (key.to_string(), text.to_string()))
                })
                .collect::<std::collections::HashMap<_, _>>()
        })
        .unwrap_or_default();

    let option_sets = common
        .get("optionSets")
        .and_then(Value::as_object)
        .map(|sets| {
            sets.iter()
                .map(|(set_name, entries)| {
                    let values = entries
                        .as_array()
                        .map(|list| list.to_vec())
                        .unwrap_or_default();
                    (set_name.to_string(), values)
                })
                .collect::<std::collections::HashMap<_, _>>()
        })
        .unwrap_or_default();

    Ok(RuleCatalogPayload {
        triggers,
        conditions,
        effects,
        generic_triggers,
        all_objects,
        trigger_groups,
        option_sources,
        option_sets,
    })
}
