import {
  ArchiveBoxIcon,
  BanknotesIcon,
  CakeIcon,
  ChartBarIcon,
  ClockIcon,
  Cog6ToothIcon,
  HandRaisedIcon,
  InformationCircleIcon,
  PencilSquareIcon,
  PlayIcon,
  ReceiptPercentIcon,
  RectangleStackIcon,
  ShoppingBagIcon,
  ShoppingCartIcon,
  SparklesIcon,
  TicketIcon,
  UserGroupIcon,
  UserIcon,
  VariableIcon,
} from "@heroicons/react/24/outline";
import type {
  ConditionParameter,
  EffectParameter,
  GlobalConditionTypeDefinition,
  GlobalEffectTypeDefinition,
  GlobalTriggerDefinition,
} from "./types";
import { entityBridge } from "@/lib/entity-bridge";
import {
  ALL_CONSUMABLES,
  CONSUMABLE_SETS,
  CUSTOM_CONSUMABLES,
  DECKS,
  EDITIONS,
  ENHANCEMENTS,
  POKER_HANDS,
  PLANET_CARDS,
  RARITIES,
  RANKS,
  SEALS,
  SPECTRAL_CARDS,
  SUITS,
  TAGS,
  TAROT_CARDS,
  VOUCHERS,
} from "@/lib/balatro-utils";

export interface CategoryDefinition {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface RuleCatalogPayload {
  triggers: GlobalTriggerDefinition[];
  conditions: GlobalConditionTypeDefinition[];
  effects: GlobalEffectTypeDefinition[];
  generic_triggers: string[];
  all_objects: string[];
  trigger_groups?: Record<string, string[]>;
  option_sources?: Record<string, string>;
  option_sets?: Record<string, unknown[]>;
}

export const TRIGGER_CATEGORIES: CategoryDefinition[] = [
  { label: "Usage", icon: TicketIcon },
  { label: "Hand Scoring", icon: HandRaisedIcon },
  { label: "In Blind Events", icon: PlayIcon },
  { label: "Round Events", icon: ClockIcon },
  { label: "Economy", icon: BanknotesIcon },
  { label: "Packs & Consumables", icon: RectangleStackIcon },
  { label: "Shop Events", icon: ShoppingCartIcon },
  { label: "Special", icon: SparklesIcon },
];

export const CONDITION_CATEGORIES: CategoryDefinition[] = [
  { label: "Hand", icon: HandRaisedIcon },
  { label: "Card", icon: RectangleStackIcon },
  { label: "Jokers", icon: UserGroupIcon },
  { label: "Player Resources", icon: UserIcon },
  { label: "Deck", icon: ArchiveBoxIcon },
  { label: "Variables", icon: VariableIcon },
  { label: "Probability", icon: ReceiptPercentIcon },
  { label: "Game State", icon: InformationCircleIcon },
  { label: "Special", icon: SparklesIcon },
];

export const EFFECT_CATEGORIES: CategoryDefinition[] = [
  { label: "Deck Card Modifications", icon: ArchiveBoxIcon },
  { label: "Scoring", icon: ChartBarIcon },
  { label: "Economy", icon: BanknotesIcon },
  { label: "Card Effects", icon: PencilSquareIcon },
  { label: "Blind & Ante", icon: PlayIcon },
  { label: "Jokers", icon: UserGroupIcon },
  { label: "Consumables", icon: CakeIcon },
  { label: "Vouchers & Tags", icon: TicketIcon },
  { label: "Shop", icon: ShoppingBagIcon },
  { label: "Game Rules", icon: Cog6ToothIcon },
  { label: "Variables", icon: VariableIcon },
  { label: "Probability", icon: ReceiptPercentIcon },
  { label: "Special", icon: SparklesIcon },
];

export let TRIGGERS: GlobalTriggerDefinition[] = [];
export let CONDITIONS: GlobalConditionTypeDefinition[] = [];
export let EFFECTS: GlobalEffectTypeDefinition[] = [];
export let GENERIC_TRIGGERS: string[] = [];
export let ALL_OBJECTS: string[] = [];
export let TRIGGER_GROUPS: Record<string, string[]> = {};
export let COMMON_OPTION_SETS: Record<string, unknown[]> = {};

type CatalogOption = {
  value: string;
  label: string;
};

type SourcedParameter = (ConditionParameter | EffectParameter) & {
  optionSource?: string;
  optionSet?: string;
};

type CatalogOptionLike = {
  value: string;
  label: string;
  [key: string]: unknown;
};

const OPTION_SOURCES: Record<string, () => CatalogOption[]> = {
  rarities: () => asOptionArray(RARITIES()),
  consumableSets: () => asOptionArray(CONSUMABLE_SETS()),
  enhancements: () => asOptionArray(ENHANCEMENTS()),
  editions: () => asOptionArray(EDITIONS()),
  seals: () => asOptionArray(SEALS()),
  vouchers: () => asOptionArray(VOUCHERS()),
  decks: () => asOptionArray(DECKS()),
  ranks: () => asOptionArray(RANKS),
  suits: () => asOptionArray(SUITS),
  pokerHands: () => asOptionArray(POKER_HANDS),
  tags: () => asOptionArray(TAGS),
  tarotCards: () => asOptionArray(TAROT_CARDS),
  planetCards: () => asOptionArray(PLANET_CARDS),
  spectralCards: () => asOptionArray(SPECTRAL_CARDS),
  allConsumables: () => asOptionArray(ALL_CONSUMABLES),
};

const LEGACY_PARAM_SOURCES: Record<string, string> = {
  rarity: "rarities",
  consumable_type: "consumableSets",
  enhancement: "enhancements",
  edition: "editions",
  seal: "seals",
  specific_voucher: "vouchers",
  decks: "decks",
  rank: "ranks",
  specific_rank: "ranks",
  new_rank: "ranks",
  suit: "suits",
  specific_suit: "suits",
  new_suit: "suits",
  specific_pokerhand: "pokerHands",
};

function asOptionArray(source: unknown): CatalogOption[] {
  if (!Array.isArray(source)) {
    return [];
  }

  return source
    .filter((item): item is { value: unknown; label: unknown } => {
      return (
        !!item && typeof item === "object" && "value" in item && "label" in item
      );
    })
    .map((item) => ({
      value: String(item.value),
      label: String(item.label),
    }));
}

function asOptionObjectArray(source: unknown): CatalogOptionLike[] {
  if (!Array.isArray(source)) {
    return [];
  }

  return source
    .filter((item): item is Record<string, unknown> => {
      return (
        !!item && typeof item === "object" && "value" in item && "label" in item
      );
    })
    .map((item) => ({
      ...item,
      value: String(item.value),
      label: String(item.label),
    }));
}

function uniqueByValue(options: CatalogOption[]): CatalogOption[] {
  const seen = new Set<string>();
  const merged: CatalogOption[] = [];

  for (const option of options) {
    if (seen.has(option.value)) {
      continue;
    }
    seen.add(option.value);
    merged.push(option);
  }

  return merged;
}

function uniqueOptionObjectsByValue(
  options: CatalogOptionLike[],
): CatalogOptionLike[] {
  const seen = new Set<string>();
  const merged: CatalogOptionLike[] = [];

  for (const option of options) {
    if (seen.has(option.value)) {
      continue;
    }
    seen.add(option.value);
    merged.push(option);
  }

  return merged;
}

function applyOptionSet(param: ConditionParameter | EffectParameter) {
  const sourcedParam = param as SourcedParameter;
  if (!sourcedParam.optionSet) {
    return;
  }

  const source = COMMON_OPTION_SETS[sourcedParam.optionSet];
  if (!source) {
    return;
  }

  const dynamic = asOptionObjectArray(source);
  if (param.type === "checkbox") {
    const staticOptions = asOptionObjectArray(
      (param as EffectParameter).checkboxOptions,
    );
    (param as EffectParameter).checkboxOptions = uniqueOptionObjectsByValue([
      ...staticOptions,
      ...dynamic,
    ]);
    return;
  }

  const staticOptions = asOptionObjectArray(param.options);
  param.options = uniqueOptionObjectsByValue([...staticOptions, ...dynamic]);
}

function mergeWithDynamicOptions(
  param: ConditionParameter | EffectParameter,
  dynamic: CatalogOption[],
) {
  const staticOptions = asOptionArray(param.options);
  param.options = uniqueByValue([...staticOptions, ...dynamic]);
}

function mergeWithDynamicCheckboxOptions(
  param: ConditionParameter | EffectParameter,
  dynamic: CatalogOption[],
) {
  const staticOptions = asOptionArray(
    (param as EffectParameter).checkboxOptions,
  );
  (param as EffectParameter).checkboxOptions = uniqueByValue([
    ...staticOptions,
    ...dynamic,
  ]);
}

function applyOptionSource(
  param: ConditionParameter | EffectParameter,
  sourceKey: string,
) {
  const source = OPTION_SOURCES[sourceKey];
  if (!source) {
    return;
  }

  const dynamic = source();
  if (param.type === "checkbox") {
    mergeWithDynamicCheckboxOptions(param, dynamic);
    return;
  }

  mergeWithDynamicOptions(param, dynamic);
}

function consumablesForSet(selectedSet?: string): CatalogOption[] {
  if (
    !selectedSet ||
    selectedSet === "any" ||
    selectedSet === "random" ||
    selectedSet === "keyvar"
  ) {
    return [];
  }

  const vanillaBySet: Record<string, CatalogOption[]> = {
    Tarot: asOptionArray(TAROT_CARDS),
    Planet: asOptionArray(PLANET_CARDS),
    Spectral: asOptionArray(SPECTRAL_CARDS),
  };

  const setKey = selectedSet.includes("_")
    ? selectedSet.split("_").slice(1).join("_")
    : selectedSet;

  const custom = CUSTOM_CONSUMABLES()
    .filter(
      (consumable) =>
        consumable.set === selectedSet || consumable.set === setKey,
    )
    .map((consumable) => ({
      value: consumable.value,
      label: consumable.label,
    }));

  return uniqueByValue([
    { value: "any", label: "Any from Set" },
    ...(vanillaBySet[selectedSet] ?? []),
    ...custom,
  ]);
}

function applyDynamicParameterOptions(
  param: ConditionParameter | EffectParameter,
  definitionId: string,
) {
  const sourcedParam = param as SourcedParameter;

  applyOptionSet(param);

  if (sourcedParam.optionSource) {
    applyOptionSource(sourcedParam, sourcedParam.optionSource);
  }

  const legacySource = LEGACY_PARAM_SOURCES[sourcedParam.id];
  if (legacySource) {
    applyOptionSource(sourcedParam, legacySource);
  }

  switch (param.id) {
    case "rank_pool":
      applyOptionSource(param, "ranks");
      return;
    case "suit_pool":
      applyOptionSource(param, "suits");
      return;
    case "pokerhand_pool":
      applyOptionSource(param, "pokerHands");
      return;
    case "specific_card":
      if (
        definitionId !== "consumable_count" &&
        definitionId !== "consumable_type" &&
        definitionId !== "create_consumable" &&
        definitionId !== "copy_consumable"
      ) {
        return;
      }
      param.options = (
        parentValues: Record<string, { value: unknown; valueType?: string }>,
      ) => {
        const selectedSet = String(
          parentValues?.consumable_type?.value ??
            parentValues?.set?.value ??
            "",
        );
        return consumablesForSet(selectedSet);
      };
      return;
    default:
      return;
  }
}

function applyDynamicCatalogOptions() {
  for (const definition of CONDITIONS) {
    for (const param of definition.params ?? []) {
      applyDynamicParameterOptions(param, definition.id);
    }
  }

  for (const definition of EFFECTS) {
    for (const param of definition.params ?? []) {
      applyDynamicParameterOptions(param, definition.id);
    }
  }
}

function resolveApplicableTriggers(
  definition: GlobalConditionTypeDefinition | GlobalEffectTypeDefinition,
): string[] {
  const explicit = definition.applicableTriggers ?? [];
  const groupIds = definition.applicableTriggerGroups ?? [];
  const fromGroups = groupIds.flatMap(
    (groupId: string) => TRIGGER_GROUPS[groupId] ?? [],
  );
  return uniqueByValue(
    [...explicit, ...fromGroups].map((value) => ({ value, label: value })),
  ).map((entry) => entry.value);
}

function applyTriggerGroupsToCatalog() {
  CONDITIONS = CONDITIONS.map((definition) => ({
    ...definition,
    applicableTriggers: resolveApplicableTriggers(definition),
  }));

  EFFECTS = EFFECTS.map((definition) => ({
    ...definition,
    applicableTriggers: resolveApplicableTriggers(definition),
  }));
}

export async function initializeRuleCatalogFromRust() {
  const payload =
    await entityBridge.getRulebuilderCatalog<RuleCatalogPayload>();
  TRIGGERS = payload.triggers;
  CONDITIONS = payload.conditions;
  EFFECTS = payload.effects;
  GENERIC_TRIGGERS = payload.generic_triggers;
  ALL_OBJECTS = payload.all_objects;
  TRIGGER_GROUPS = payload.trigger_groups ?? {};
  COMMON_OPTION_SETS = payload.option_sets ?? {};
  applyTriggerGroupsToCatalog();
  applyDynamicCatalogOptions();
}

export function getTriggerById(
  id: string,
): GlobalTriggerDefinition | undefined {
  return TRIGGERS.find((trigger) => trigger.id === id);
}

export function getTriggers(itemType: string): GlobalTriggerDefinition[] {
  const normalizedType =
    itemType === "edition" || itemType === "enhancement" || itemType === "seal"
      ? "card"
      : itemType;
  return TRIGGERS.filter((trigger) =>
    trigger.objectUsers.includes(normalizedType),
  );
}

export function getConditionTypeById(
  id: string,
): GlobalConditionTypeDefinition | undefined {
  return CONDITIONS.find((conditionType) => conditionType.id === id);
}

export function getConditionsForTrigger(
  triggerId: string,
  itemType: string,
): GlobalConditionTypeDefinition[] {
  const normalizedType =
    itemType === "enhancement" || itemType === "edition" || itemType === "seal"
      ? "card"
      : itemType;

  if (
    (normalizedType === "voucher" || normalizedType === "deck") &&
    triggerId === "card_used"
  ) {
    return [];
  }

  return CONDITIONS.filter(
    (condition) =>
      condition.applicableTriggers?.includes(triggerId) &&
      condition.objectUsers.includes(normalizedType),
  );
}

export function getEffectTypeById(
  id: string,
): GlobalEffectTypeDefinition | undefined {
  return EFFECTS.find((effectType) => effectType.id === id);
}

export function getEffectsForTrigger(
  triggerId: string,
  itemType: string,
): GlobalEffectTypeDefinition[] {
  const normalizedType =
    itemType === "enhancement" || itemType === "edition" || itemType === "seal"
      ? "card"
      : itemType;

  return EFFECTS.filter(
    (effect) =>
      effect.applicableTriggers?.includes(triggerId) &&
      effect.objectUsers.includes(normalizedType),
  );
}
