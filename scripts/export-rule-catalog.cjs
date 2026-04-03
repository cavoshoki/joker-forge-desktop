const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const catalogDir = path.join(projectRoot, "src-tauri", "src", "mod_engine", "catalog");

const files = {
  triggers: path.join(catalogDir, "triggers.json"),
  conditions: path.join(catalogDir, "conditions.json"),
  effects: path.join(catalogDir, "effects.json"),
  common: path.join(catalogDir, "common.json"),
  monolith: path.join(catalogDir, "rule_catalog.json"),
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

const SOURCE_BY_PARAM = {
  rarity: "rarities",
  joker_rarity: "rarities",
  consumable_type: "consumableSets",
  consumable_set: "consumableSets",
  specific_voucher: "vouchers",
  voucher: "vouchers",
  decks: "decks",
  rank: "ranks",
  new_rank: "ranks",
  specific_rank: "ranks",
  specific_selected_Rank: "ranks",
  specific_replace_Rank: "ranks",
  suit: "suits",
  new_suit: "suits",
  specific_suit: "suits",
  selected_suit: "suits",
  replace_suit: "suits",
  specific_pokerhand: "pokerHands",
  specific_hand: "pokerHands",
  enhancement: "enhancements",
  new_enhancement: "enhancements",
  specific_enhancement: "enhancements",
  edition: "editions",
  new_edition: "editions",
  specific_edition: "editions",
  seal: "seals",
  new_seal: "seals",
  specific_seal: "seals",
  rank_pool: "ranks",
  suit_pool: "suits",
  pokerhand_pool: "pokerHands",
};

function inferSource(definitionId, param) {
  if (SOURCE_BY_PARAM[param.id]) {
    return SOURCE_BY_PARAM[param.id];
  }

  const label = String(param.label || "").toLowerCase();
  if (param.id === "specific_tag" || (param.id === "value" && label.includes("tag"))) {
    return "tags";
  }

  if (
    param.id === "specific_card" &&
    ["consumable_count", "consumable_type", "create_consumable", "copy_consumable", "destroy_consumable", "probability_identifier"].includes(definitionId)
  ) {
    return "allConsumables";
  }

  if (param.id === "set" && label.includes("consumable")) {
    return "consumableSets";
  }

  return undefined;
}

function normalizeOptionSources(definitions) {
  let updates = 0;

  for (const definition of definitions) {
    for (const param of definition.params || []) {
      const source = inferSource(definition.id, param);
      if (!source) {
        continue;
      }
      if (param.optionSource !== source) {
        param.optionSource = source;
        updates += 1;
      }
    }
  }

  return updates;
}

function compressApplicableTriggers(definitions, triggerGroups) {
  const eligibleGroups = Object.entries(triggerGroups)
    .filter(([groupId, values]) => groupId !== "allTriggers" && Array.isArray(values) && values.length >= 2)
    .map(([groupId, values]) => ({ groupId, values, set: new Set(values) }))
    .sort((a, b) => b.values.length - a.values.length);

  let compressed = 0;

  for (const definition of definitions) {
    if (!Array.isArray(definition.applicableTriggers) || definition.applicableTriggers.length === 0) {
      continue;
    }

    const original = definition.applicableTriggers;
    const remaining = new Set(original);
    const pickedGroups = [...(definition.applicableTriggerGroups || [])];

    for (const group of eligibleGroups) {
      const matchesFully = group.values.every((triggerId) => remaining.has(triggerId));
      if (!matchesFully) {
        continue;
      }

      if (!pickedGroups.includes(group.groupId)) {
        pickedGroups.push(group.groupId);
      }

      for (const triggerId of group.values) {
        remaining.delete(triggerId);
      }
    }

    const leftovers = original.filter((triggerId) => remaining.has(triggerId));

    if (pickedGroups.length === 0) {
      continue;
    }

    definition.applicableTriggerGroups = pickedGroups;
    if (leftovers.length > 0) {
      definition.applicableTriggers = leftovers;
    } else {
      delete definition.applicableTriggers;
    }
    compressed += 1;
  }

  return compressed;
}

function run() {
  const triggers = readJson(files.triggers);
  const conditions = readJson(files.conditions);
  const effects = readJson(files.effects);
  const common = readJson(files.common);

  const conditionOptionUpdates = normalizeOptionSources(conditions);
  const effectOptionUpdates = normalizeOptionSources(effects);

  const conditionTriggerCompression = compressApplicableTriggers(
    conditions,
    common.triggerGroups || {},
  );
  const effectTriggerCompression = compressApplicableTriggers(
    effects,
    common.triggerGroups || {},
  );

  writeJson(files.conditions, conditions);
  writeJson(files.effects, effects);

  const payload = {
    triggers,
    conditions,
    effects,
    genericTriggers: common.genericTriggers || [],
    allObjects: common.allObjects || [],
    triggerGroups: common.triggerGroups || {},
    optionSources: common.optionSources || {},
  };

  writeJson(files.monolith, payload);

  console.log(`OptionSource updates: conditions=${conditionOptionUpdates}, effects=${effectOptionUpdates}`);
  console.log(
    `Trigger group compression: conditions=${conditionTriggerCompression}, effects=${effectTriggerCompression}`,
  );
  console.log(`Exported combined catalog to ${files.monolith}`);
}

run();
