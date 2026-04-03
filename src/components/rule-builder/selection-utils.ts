import type {
  Condition,
  Effect,
  LoopGroup,
  RandomGroup,
  Rule,
  SelectedItem,
} from "./types";

export const getSelectedRule = (
  rules: Rule[],
  selectedItem: SelectedItem,
): Rule | null => {
  if (!selectedItem) {
    return null;
  }

  return rules.find((rule) => rule.id === selectedItem.ruleId) || null;
};

export const getSelectedCondition = (
  rules: Rule[],
  selectedItem: SelectedItem,
): Condition | null => {
  if (
    !selectedItem ||
    selectedItem.type !== "condition" ||
    !selectedItem.itemId
  ) {
    return null;
  }

  const rule = getSelectedRule(rules, selectedItem);
  if (!rule) {
    return null;
  }

  for (const group of rule.conditionGroups) {
    const condition = group.conditions.find(
      (c) => c.id === selectedItem.itemId,
    );
    if (condition) {
      return condition;
    }
  }

  return null;
};

export const getSelectedEffect = (
  rules: Rule[],
  selectedItem: SelectedItem,
): Effect | null => {
  if (!selectedItem || selectedItem.type !== "effect" || !selectedItem.itemId) {
    return null;
  }

  const rule = getSelectedRule(rules, selectedItem);
  if (!rule) {
    return null;
  }

  const mainEffect = rule.effects.find((e) => e.id === selectedItem.itemId);
  if (mainEffect) {
    return mainEffect;
  }

  for (const group of rule.randomGroups) {
    const effect = group.effects.find((e) => e.id === selectedItem.itemId);
    if (effect) {
      return effect;
    }
  }

  for (const group of rule.loops) {
    const effect = group.effects.find((e) => e.id === selectedItem.itemId);
    if (effect) {
      return effect;
    }
  }

  return null;
};

export const getSelectedRandomGroup = (
  rules: Rule[],
  selectedItem: SelectedItem,
): RandomGroup | null => {
  if (
    !selectedItem ||
    selectedItem.type !== "randomgroup" ||
    !selectedItem.randomGroupId
  ) {
    return null;
  }

  const rule = getSelectedRule(rules, selectedItem);
  if (!rule) {
    return null;
  }

  return (
    rule.randomGroups.find(
      (group) => group.id === selectedItem.randomGroupId,
    ) || null
  );
};

export const getSelectedLoopGroup = (
  rules: Rule[],
  selectedItem: SelectedItem,
): LoopGroup | null => {
  if (
    !selectedItem ||
    selectedItem.type !== "loopgroup" ||
    !selectedItem.loopGroupId
  ) {
    return null;
  }

  const rule = getSelectedRule(rules, selectedItem);
  if (!rule) {
    return null;
  }

  return (
    rule.loops.find((group) => group.id === selectedItem.loopGroupId) || null
  );
};
