import JSZip from "jszip";
import { invoke } from "@tauri-apps/api/core";
import type { JokerData, ModMetadata, UserVariable } from "@/lib/types";
import type { Rule } from "@/components/rule-builder/types";

interface RustAtlasPos {
  x: number;
  y: number;
}

interface RustTypedValue {
  value: unknown;
  valueType: string;
}

type RustParamValue = string | number | boolean | RustTypedValue;

interface RustConditionDef {
  condition_type: string;
  negate: boolean;
  params: Record<string, RustParamValue>;
}

interface RustConditionGroupDef {
  logic_operator: "and" | "or";
  conditions: RustConditionDef[];
}

interface RustEffectDef {
  effect_type: string;
  params: Record<string, RustParamValue>;
}

interface RustRandomGroupDef {
  id: string;
  chance_numerator: RustParamValue;
  chance_denominator: RustParamValue;
  effects: RustEffectDef[];
}

interface RustLoopGroupDef {
  id: string;
  count: RustParamValue;
  effects: RustEffectDef[];
}

interface RustRuleDef {
  id: string;
  trigger: string;
  condition_groups: RustConditionGroupDef[];
  effects: RustEffectDef[];
  random_groups: RustRandomGroupDef[];
  loop_groups: RustLoopGroupDef[];
}

interface RustUserVariableDef {
  name: string;
  var_type: "number" | "suit" | "rank" | "poker_hand" | "key" | "text";
  initial_value: RustParamValue;
}

interface RustJokerDef {
  key: string;
  name: string;
  description: string[];
  cost: number;
  rarity: string;
  blueprint_compat: boolean;
  eternal_compat: boolean;
  perishable_compat: boolean;
  unlocked: boolean;
  discovered: boolean;
  atlas: string;
  pos: RustAtlasPos;
  soul_pos?: RustAtlasPos;
  user_variables: RustUserVariableDef[];
  rules: RustRuleDef[];
}

const splitDescription = (description: string): string[] => {
  const normalized = description.replace(/<br\s*\/?>/gi, "\n");
  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines.length > 0 ? lines : ["No description"];
};

const normalizeRarity = (rarity: JokerData["rarity"]): string => {
  if (typeof rarity === "string") return rarity.toLowerCase();
  if (rarity === 1) return "common";
  if (rarity === 2) return "uncommon";
  if (rarity === 3) return "rare";
  if (rarity === 4) return "legendary";
  return "common";
};

const toRustParamValue = (
  raw: { value: unknown; valueType?: string } | undefined,
): RustParamValue => {
  if (!raw) return 0;
  if (raw.valueType && raw.valueType.length > 0) {
    return { value: raw.value, valueType: raw.valueType };
  }
  if (
    typeof raw.value === "string" ||
    typeof raw.value === "number" ||
    typeof raw.value === "boolean"
  ) {
    return raw.value;
  }
  return String(raw.value ?? "");
};

const mapParams = (
  params: Record<string, { value: unknown; valueType?: string }> | undefined,
): Record<string, RustParamValue> => {
  if (!params) return {};
  const out: Record<string, RustParamValue> = {};
  for (const [key, value] of Object.entries(params)) {
    out[key] = toRustParamValue(value);
  }
  return out;
};

const mapRules = (rules: Rule[] | undefined): RustRuleDef[] => {
  if (!rules) return [];
  return rules.map((rule) => ({
    id: rule.id,
    trigger: rule.trigger,
    condition_groups: (rule.conditionGroups || []).map((group) => ({
      logic_operator: group.operator === "or" ? "or" : "and",
      conditions: (group.conditions || []).map((condition) => ({
        condition_type: condition.type,
        negate: !!condition.negate,
        params: mapParams(condition.params),
      })),
    })),
    effects: (rule.effects || []).map((effect) => ({
      effect_type: effect.type,
      params: mapParams(effect.params),
    })),
    random_groups: (rule.randomGroups || []).map((group) => ({
      id: group.id,
      chance_numerator: toRustParamValue(group.chance_numerator),
      chance_denominator: toRustParamValue(group.chance_denominator),
      effects: (group.effects || []).map((effect) => ({
        effect_type: effect.type,
        params: mapParams(effect.params),
      })),
    })),
    loop_groups: (rule.loops || []).map((group) => ({
      id: group.id,
      count: toRustParamValue(group.repetitions),
      effects: (group.effects || []).map((effect) => ({
        effect_type: effect.type,
        params: mapParams(effect.params),
      })),
    })),
  }));
};

const mapUserVariableType = (
  type: string | undefined,
): RustUserVariableDef["var_type"] => {
  if (type === "pokerhand") return "poker_hand";
  if (type === "suit" || type === "rank" || type === "key" || type === "text")
    return type;
  return "number";
};

const getUserVariableInitialValue = (v: UserVariable): RustParamValue => {
  if (v.type === "suit") return v.initialSuit ?? "Spades";
  if (v.type === "rank") return v.initialRank ?? "Ace";
  if (v.type === "pokerhand") return v.initialPokerHand ?? "High Card";
  if (v.type === "key") return v.initialKey ?? "none";
  if (v.type === "text") return v.initialText ?? "";
  return typeof v.initialValue === "number"
    ? v.initialValue
    : Number(v.initialValue ?? 0) || 0;
};

const mapJokerToRustDef = (joker: JokerData): RustJokerDef => {
  return {
    key: joker.objectKey,
    name: joker.name,
    description: splitDescription(joker.description),
    cost: joker.cost,
    rarity: normalizeRarity(joker.rarity),
    blueprint_compat: !!joker.blueprint_compat,
    eternal_compat: !!joker.eternal_compat,
    perishable_compat: joker.perishable_compat ?? true,
    unlocked: joker.unlocked ?? true,
    discovered: joker.discovered ?? true,
    atlas: "CustomJokers",
    pos: { x: 0, y: 0 },
    user_variables: (joker.userVariables || []).map((v) => ({
      name: v.name,
      var_type: mapUserVariableType(v.type),
      initial_value: getUserVariableInitialValue(v),
    })),
    rules: mapRules(joker.rules),
  };
};

const buildMainLua = (jokers: JokerData[]): string => {
  const sorted = [...jokers].sort((a, b) => a.orderValue - b.orderValue);
  const requires = sorted
    .map((j) => `assert(SMODS.load_file("jokers/${j.objectKey}.lua"))()`)
    .join("\n");

  return `SMODS.Atlas({
    key = "CustomJokers",
    path = "CustomJokers.png",
    px = 71,
    py = 95,
    atlas_table = "ASSET_ATLAS"
})

local NFS = require("nativefs")
to_big = to_big or function(a) return a end
lenient_bignum = lenient_bignum or function(a) return a end

${requires}
`;
};

const buildModJson = (metadata: ModMetadata): string => {
  const payload = {
    id: metadata.id,
    name: metadata.name,
    display_name: metadata.display_name,
    author: metadata.author,
    description: metadata.description,
    prefix: metadata.prefix,
    main_file: metadata.main_file,
    version: metadata.version,
    priority: metadata.priority,
    badge_colour: metadata.badge_colour,
    badge_text_colour: metadata.badge_text_colour,
    dependencies: metadata.dependencies,
    conflicts: metadata.conflicts,
    provides: metadata.provides,
  };

  return JSON.stringify(payload, null, 2);
};

const downloadBlob = (filename: string, content: Blob) => {
  const url = URL.createObjectURL(content);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const compileSingleJokerLua = async (
  joker: JokerData,
  modPrefix: string,
): Promise<string> => {
  const jokerDef = mapJokerToRustDef(joker);
  return invoke<string>("compile_joker_lua", { jokerDef, modPrefix });
};

export const exportSingleJokerRust = async (
  joker: JokerData,
  modPrefix: string,
): Promise<void> => {
  const code = await compileSingleJokerLua(joker, modPrefix);
  downloadBlob(
    `${joker.objectKey}.lua`,
    new Blob([code], { type: "text/plain" }),
  );
};

export const exportModRust = async (
  metadata: ModMetadata,
  jokers: JokerData[],
): Promise<void> => {
  const zip = new JSZip();

  zip.file(metadata.main_file, buildMainLua(jokers));
  zip.file(`${metadata.id}.json`, buildModJson(metadata));

  const jokersFolder = zip.folder("jokers");
  const sorted = [...jokers].sort((a, b) => a.orderValue - b.orderValue);

  for (const joker of sorted) {
    const code = await compileSingleJokerLua(joker, metadata.prefix);
    jokersFolder?.file(`${joker.objectKey}.lua`, code);
  }

  const content = await zip.generateAsync({ type: "blob" });
  downloadBlob(`${metadata.id}.zip`, content);
};
