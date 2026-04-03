const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const catalogDir = path.join(repoRoot, "src-tauri", "src", "mod_engine", "catalog");

const conditionsPath = path.join(catalogDir, "conditions.json");
const effectsPath = path.join(catalogDir, "effects.json");
const triggersPath = path.join(catalogDir, "triggers.json");
const commonPath = path.join(catalogDir, "common.json");

const STICKY = new Set(["any", "none", "random", "remove", "pool", "all", "keyvar"]);

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function shouldTagSource(definitionId, param) {
  const label = String(param.label || "").toLowerCase();
  return (
    param.id === "specific_tag" ||
    (param.id === "value" && (definitionId === "which_tag" || label.includes("tag")))
  );
}

function inferOptionSource(definitionId, param) {
  const id = String(param.id || "");
  const label = String(param.label || "").toLowerCase();

  if (id === "rarity" || id === "joker_rarity") return "rarities";
  if (id === "consumable_type" || id === "consumable_set") return "consumableSets";
  if (id === "specific_voucher") return "vouchers";
  if (id === "decks") return "decks";
  if (id === "specific_tag" || shouldTagSource(definitionId, param)) return "tags";

  if (
    id === "rank" ||
    id === "new_rank" ||
    id === "specific_rank" ||
    id === "specific_selected_Rank" ||
    id === "specific_replace_Rank"
  ) {
    return "ranks";
  }

  if (
    id === "suit" ||
    id === "new_suit" ||
    id === "specific_suit" ||
    id === "selected_suit" ||
    id === "replace_suit"
  ) {
    return "suits";
  }

  if (id === "specific_pokerhand" || id === "specific_hand") return "pokerHands";

  if (id === "enhancement" || id === "new_enhancement" || id === "specific_enhancement") {
    return "enhancements";
  }

  if (id === "edition" || id === "new_edition" || id === "specific_edition") {
    return "editions";
  }

  if (id === "seal" || id === "new_seal" || id === "specific_seal") {
    return "seals";
  }

  if (id === "rank_pool") return "ranks";
  if (id === "suit_pool") return "suits";
  if (id === "pokerhand_pool") return "pokerHands";

  if (
    id === "specific_card" &&
    ["consumable_count", "consumable_type", "create_consumable", "copy_consumable"].includes(definitionId)
  ) {
    return "allConsumables";
  }

  if (id === "set" && label.includes("consumable")) return "consumableSets";

  return undefined;
}

function pruneStaticOptions(param) {
  if (Array.isArray(param.options)) {
    const stickyOnly = param.options.filter((entry) => {
      if (!isObject(entry)) return false;
      const value = String(entry.value ?? "");
      return STICKY.has(value);
    });
    param.options = stickyOnly;
  }

  if (Array.isArray(param.checkboxOptions)) {
    // Keep checkbox options intact to avoid default length mismatches.
  }
}

function updateCatalogArray(entries) {
  let changed = 0;
  for (const entry of entries) {
    const definitionId = String(entry.id || "");
    if (!Array.isArray(entry.params)) continue;

    for (const param of entry.params) {
      if (!isObject(param)) continue;
      const optionSource = inferOptionSource(definitionId, param);
      if (!optionSource) continue;

      if (param.optionSource !== optionSource) {
        param.optionSource = optionSource;
        changed += 1;
      }

      pruneStaticOptions(param);
    }
  }

  return changed;
}

function updateCommon(triggers, common) {
  const triggerIds = triggers.map((entry) => entry.id).filter(Boolean);

  const byCategory = (category) =>
    triggers.filter((entry) => entry.category === category).map((entry) => entry.id);

  const byObject = (objectType) =>
    triggers
      .filter((entry) => Array.isArray(entry.objectUsers) && entry.objectUsers.includes(objectType))
      .map((entry) => entry.id);

  common.triggerGroups = {
    allTriggers: triggerIds,
    scoringTriggers: byCategory("Hand Scoring"),
    cardTriggers: byObject("card"),
    jokerTriggers: byObject("joker"),
    consumableTriggers: byObject("consumable"),
    deckTriggers: byObject("deck"),
    voucherTriggers: byObject("voucher"),
    roundTriggers: byCategory("Round Events"),
    economyTriggers: byCategory("Economy"),
    packAndConsumableTriggers: byCategory("Packs & Consumables"),
    specialTriggers: byCategory("Special"),
  };

  common.optionSources = {
    rarities: "src/lib/balatro-utils.ts::RARITIES",
    consumableSets: "src/lib/balatro-utils.ts::CONSUMABLE_SETS",
    enhancements: "src/lib/balatro-utils.ts::ENHANCEMENTS",
    editions: "src/lib/balatro-utils.ts::EDITIONS",
    seals: "src/lib/balatro-utils.ts::SEALS",
    vouchers: "src/lib/balatro-utils.ts::VOUCHERS",
    decks: "src/lib/balatro-utils.ts::DECKS",
    ranks: "src/lib/balatro-utils.ts::RANKS",
    suits: "src/lib/balatro-utils.ts::SUITS",
    pokerHands: "src/lib/balatro-utils.ts::POKER_HANDS",
    tags: "src/lib/balatro-utils.ts::TAGS",
    tarotCards: "src/lib/balatro-utils.ts::TAROT_CARDS",
    planetCards: "src/lib/balatro-utils.ts::PLANET_CARDS",
    spectralCards: "src/lib/balatro-utils.ts::SPECTRAL_CARDS",
    allConsumables: "src/lib/balatro-utils.ts::ALL_CONSUMABLES",
  };
}

const conditions = JSON.parse(fs.readFileSync(conditionsPath, "utf8"));
const effects = JSON.parse(fs.readFileSync(effectsPath, "utf8"));
const triggers = JSON.parse(fs.readFileSync(triggersPath, "utf8"));
const common = JSON.parse(fs.readFileSync(commonPath, "utf8"));

const conditionUpdates = updateCatalogArray(conditions);
const effectUpdates = updateCatalogArray(effects);
updateCommon(triggers, common);

fs.writeFileSync(conditionsPath, `${JSON.stringify(conditions, null, 2)}\n`);
fs.writeFileSync(effectsPath, `${JSON.stringify(effects, null, 2)}\n`);
fs.writeFileSync(commonPath, `${JSON.stringify(common, null, 2)}\n`);

console.log(`Updated optionSource metadata in conditions: ${conditionUpdates}`);
console.log(`Updated optionSource metadata in effects: ${effectUpdates}`);
console.log("Expanded common.json with triggerGroups and optionSources.");
