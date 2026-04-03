import type { Rule } from "@/lib/types";

type CompilerObjectType = "joker" | "consumable" | "card" | "voucher" | "deck";

const SUPPORTED_EFFECTS = new Set<string>([
  "add_chips",
  "add_mult",
  "apply_x_mult",
  "apply_x_chips",
  "apply_exp_chips",
  "apply_exp_mult",
  "apply_hyper_chips",
  "apply_hyper_mult",
  "create_joker",
  "create_consumable",
  "add_consumable",
  "destroy_card",
  "destroy_joker",
  "set_dollars",
  "retrigger",
  "show_message",
  "play_sound",
  "juice_up_joker",
  "level_up_hand",
  "edit_blind_size",
]);

const SUPPORTED_CONDITIONS = new Set<string>([
  "hand_type",
  "hand_count",
  "hand_size",
  "suit_count",
  "rank_count",
  "hand_level",
  "card_rank",
  "card_suit",
  "card_enhancement",
  "card_edition",
  "card_seal",
  "ante_level",
  "blind_type",
  "blind_name",
  "player_money",
  "remaining_hands",
  "remaining_discards",
  "joker_count",
  "consumable_count",
  "deck_size",
  "generic_compare",
]);

const SUPPORTED_TRIGGERS: Record<CompilerObjectType, Set<string>> = {
  joker: new Set<string>([
    "hand_played",
    "before_hand_played",
    "after_hand_played",
    "card_scored",
    "joker_evaluated",
    "joker_triggered",
    "hand_drawn",
    "first_hand_drawn",
    "hand_discarded",
    "card_discarded",
    "card_held_in_hand",
    "round_end",
    "blind_selected",
    "blind_skipped",
    "blind_disabled",
    "boss_defeated",
    "ante_start",
    "card_bought",
    "card_sold",
    "selling_self",
    "buying_self",
    "shop_entered",
    "shop_exited",
    "shop_reroll",
    "consumable_used",
    "playing_card_added",
    "booster_opened",
    "card_destroyed",
    "game_over",
    "change_probability",
    "passive",
    "blind_reward",
    "boss_blind_reward",
  ]),
  consumable: new Set<string>(["card_used", "hand_played"]),
  card: new Set<string>(["card_scored", "card_held_in_hand", "card_discarded"]),
  voucher: new Set<string>(["card_used"]),
  deck: new Set<string>(["hand_played", "card_scored", "round_end"]),
};

const collectRuleEffects = (rule: Rule): string[] => {
  const direct = rule.effects?.map((effect) => effect.type) ?? [];
  const random =
    rule.randomGroups?.flatMap((group) =>
      group.effects.map((effect) => effect.type),
    ) ?? [];
  const loops =
    rule.loops?.flatMap((group) =>
      group.effects.map((effect) => effect.type),
    ) ?? [];
  return [...direct, ...random, ...loops];
};

export const getUnsupportedRuleParts = (
  rules: Rule[] | undefined,
  objectType: CompilerObjectType,
): string[] => {
  if (!rules || rules.length === 0) return [];

  const unsupported = new Set<string>();
  const supportedTriggers = SUPPORTED_TRIGGERS[objectType];

  for (const rule of rules) {
    if (rule.trigger && !supportedTriggers.has(rule.trigger)) {
      unsupported.add(`trigger:${rule.trigger}`);
    }

    for (const group of rule.conditionGroups ?? []) {
      for (const condition of group.conditions ?? []) {
        if (condition.type && !SUPPORTED_CONDITIONS.has(condition.type)) {
          unsupported.add(`condition:${condition.type}`);
        }
      }
    }

    for (const effectType of collectRuleEffects(rule)) {
      if (effectType && !SUPPORTED_EFFECTS.has(effectType)) {
        unsupported.add(`effect:${effectType}`);
      }
    }
  }

  return Array.from(unsupported).sort();
};

export const formatUnsupportedRulesError = (
  unsupportedParts: string[],
  exportLabel: string,
): string => {
  const preview = unsupportedParts.slice(0, 8).join(", ");
  const suffix = unsupportedParts.length > 8 ? ", ..." : "";
  return `${exportLabel} export failed: some selected rules are not implemented yet (${preview}${suffix}).`;
};
