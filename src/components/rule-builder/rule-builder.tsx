import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useContext,
} from "react";
import {
  TransformWrapper,
  TransformComponent,
  ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";
import {
  DndContext,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  DragStartEvent,
  DragEndEvent,
  closestCenter,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { sortableKeyboardCoordinates, arrayMove } from "@dnd-kit/sortable";
import type {
  GlobalEffectTypeDefinition,
  Rule,
  Condition,
  Effect,
  RandomGroup,
  GlobalConditionTypeDefinition,
  LoopGroup,
  SelectedItem,
} from "./types";
import RuleCard from "./rule-card";
import FloatingDock from "./floating-dock";
import BlockPalette from "./block-palette";
import Variables from "./variables";
import Inspector from "./inspector";
import Button from "../generic/Button";
import {
  CheckCircle,
  CornersIn,
  Browser,
  GridFour,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  Terminal,
} from "@phosphor-icons/react";
import { getConditionTypeById } from "../data/Conditions";
import { getEffectTypeById } from "../data/Effects";
import GameVariables from "./game-variables";
import { GameVariable } from "../data/GameVars";
import { motion } from "framer-motion";
import { UserConfigContext } from "@/components/Contexts";
import { detectValueType } from "../generic/RuleBlockUpdater";
import { usePanelState } from "./panel-state";
import {
  getSelectedCondition,
  getSelectedEffect,
  getSelectedLoopGroup,
  getSelectedRandomGroup,
  getSelectedRule,
} from "./selection-utils";
import IconButton from "./icon-button";
import ItemTypeBadge from "./item-type-badge";

export type ItemData = any;
type ItemType = "joker" | "consumable" | "card" | "voucher" | "deck";

interface RuleBuilderProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (rules: any[]) => void;
  existingRules: any[];
  item: ItemData;
  onUpdateItem: (updates: Partial<ItemData>) => void;
  itemType: ItemType;
}

const RuleBuilder: React.FC<RuleBuilderProps> = ({
  isOpen,
  onClose,
  onSave,
  existingRules = [],
  item,
  onUpdateItem,
  itemType,
}) => {
  const { userConfig, setUserConfig } = useContext(UserConfigContext);

  const [activeId, setActiveId] = useState<string | null>(null);

  const [inspectorIsOpen, setInspectorIsOpen] = useState(false);

  const [isFirstSelection, setIsFirstSelection] = useState(true);

  const getConditionType = getConditionTypeById;
  const getEffectType = getEffectTypeById;

  const [rules, setRules] = useState<Rule[]>([]);
  const [selectedItem, setSelectedItem] = useState<SelectedItem>(null);
  const [panState, setPanState] = useState({ x: 0, y: 0, scale: 1 });
  const [gridSnapping, setGridSnapping] = useState<boolean>(
    userConfig.defaultGridSnap ?? false,
  );
  const { panels, togglePanel, updatePanelPosition } = usePanelState(itemType);

  const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false);
  const [showNoRulesMessage, setShowNoRulesMessage] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef<ReactZoomPanPinchRef>(null);

  const [selectedGameVariable, setSelectedGameVariable] =
    useState<GameVariable | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleSaveAndClose = useCallback(() => {
    onSave(rules);
    onClose();
  }, [onSave, onClose, rules]);

  const handleRecenter = () => {
    if (transformRef.current) {
      transformRef.current.resetTransform();
      setPanState({ x: 0, y: 0, scale: 1 });
    }
  };

  const handleResetPosition = () => {
    rules.forEach((rule, index) => {
      rule.position = { x: 800 + index * 340, y: 300 };
    });
    handleRecenter(); // why would you look elsewhere if the windows are at the center
  };

  const handleGridZoomChange = (direction: "in" | "out") => {
    if (!transformRef.current) return;
    if (direction === "in") {
      transformRef.current.zoomIn(0.25);
    } else {
      transformRef.current.zoomOut(0.25);
    }
  };

  const createConditionFromType = (conditionType: string): Condition => {
    const conditionTypeData = getConditionType(conditionType);
    const defaultParams: Record<
      string,
      { value: unknown; valueType?: string }
    > = {};

    if (conditionTypeData) {
      conditionTypeData.params.forEach((param) => {
        const defaultValue = param.default ?? undefined;
        defaultParams[param.id] = {
          value: defaultValue,
          valueType: detectValueType(defaultValue),
        };
      });
    }

    return {
      id: crypto.randomUUID(),
      type: conditionType,
      negate: false,
      params: defaultParams,
    };
  };

  const createEffectFromType = (effectType: string): Effect => {
    const effectTypeData = getEffectType(effectType);
    const defaultParams: Record<
      string,
      { value: unknown; valueType?: string }
    > = {};

    if (effectTypeData) {
      effectTypeData.params.forEach((param) => {
        const defaultValue = param.default ?? undefined;
        defaultParams[param.id] = {
          value: defaultValue,
          valueType: detectValueType(defaultValue),
        };
      });
    }

    return {
      id: crypto.randomUUID(),
      type: effectType,
      params: defaultParams,
    };
  };

  const addConditionToRule = useCallback(
    (ruleId: string, conditionType: string) => {
      const newCondition = createConditionFromType(conditionType);
      let targetGroupId = "";

      setRules((prev) =>
        prev.map((rule) => {
          if (rule.id !== ruleId) return rule;
          if (rule.conditionGroups.length === 0) {
            const newGroupId = crypto.randomUUID();
            targetGroupId = newGroupId;
            return {
              ...rule,
              conditionGroups: [
                {
                  id: newGroupId,
                  operator: "and",
                  conditions: [newCondition],
                },
              ],
            };
          }

          targetGroupId = rule.conditionGroups[0].id;
          return {
            ...rule,
            conditionGroups: rule.conditionGroups.map((group, index) =>
              index === 0
                ? {
                    ...group,
                    conditions: [...group.conditions, newCondition],
                  }
                : group,
            ),
          };
        }),
      );

      setSelectedItem({
        type: "condition",
        ruleId,
        itemId: newCondition.id,
        groupId: targetGroupId,
      });
    },
    [getConditionType],
  );

  const addEffectToRule = useCallback(
    (ruleId: string, effectType: string) => {
      const newEffect = createEffectFromType(effectType);
      setRules((prev) =>
        prev.map((rule) =>
          rule.id === ruleId
            ? { ...rule, effects: [...rule.effects, newEffect] }
            : rule,
        ),
      );
      setSelectedItem({
        type: "effect",
        ruleId,
        itemId: newEffect.id,
      });
    },
    [getEffectType],
  );

  const getCenterPosition = () => {
    const screenCenterX =
      (typeof window !== "undefined" ? window.innerWidth : 1200) / 2;
    const screenCenterY =
      (typeof window !== "undefined" ? window.innerHeight : 800) / 2;
    const transformCenterX = screenCenterX - panState.x;
    const transformCenterY = screenCenterY - panState.y;
    return {
      x: transformCenterX - 160,
      y: transformCenterY - 200,
    };
  };

  useEffect(() => {
    if (isOpen) {
      setRules(
        existingRules.map((rule) => ({
          ...rule,
          randomGroups: rule.randomGroups || [],
          loops: rule.loops || [],
        })),
      );
      setSelectedItem(null);
      setSelectedGameVariable(null);
      setIsInitialLoadComplete(true);
      setIsFirstSelection(true);

      // Reset the no rules message state
      setShowNoRulesMessage(false);

      // If there are no existing rules, delay showing the message
      if (existingRules.length === 0) {
        const timer = setTimeout(() => {
          setShowNoRulesMessage(true);
        }, 200); // 800ms delay

        return () => clearTimeout(timer);
      }
    } else {
      // Reset states when closing
      setIsInitialLoadComplete(false);
      setShowNoRulesMessage(false);
    }
  }, [isOpen, existingRules]);

  useEffect(() => {
    setSelectedGameVariable(null);
  }, [selectedItem]);

  useEffect(() => {
    if (isOpen) {
      const handleKeyPress = (event: KeyboardEvent) => {
        if (
          event.target instanceof HTMLInputElement ||
          event.target instanceof HTMLTextAreaElement
        ) {
          return;
        }
        switch (event.key.toLowerCase()) {
          case "b":
            togglePanel("blockPalette");
            break;
          case "i":
            togglePanel("jokerInfo");
            break;
          case "v":
            // Only allow variables panel for jokers
            if (itemType === "joker") {
              togglePanel("variables");
            }
            break;
          case "g":
            togglePanel("gameVariables");
            break;
          case "p":
            togglePanel("inspector");
            break;
          case "s":
            setGridSnapping((prev) => !prev);
            break;
          case "=":
          case "+":
            handleGridZoomChange("in");
            break;
          case "-":
          case "_":
            handleGridZoomChange("out");
            break;
        }
      };

      document.addEventListener("keydown", handleKeyPress);
      return () => {
        document.removeEventListener("keydown", handleKeyPress);
      };
    }
  }, [isOpen, handleSaveAndClose, togglePanel, itemType]);

  useEffect(() => {
    if (!selectedItem) return;

    if (inspectorIsOpen) {
      if (!panels.inspector.isVisible) {
        togglePanel("inspector");
      }
      setInspectorIsOpen(false);
    } else if (isFirstSelection) {
      if (!panels.inspector.isVisible) {
        togglePanel("inspector");
      }
      setIsFirstSelection(false);
    }
  }, [
    selectedItem,
    inspectorIsOpen,
    isFirstSelection,
    panels.inspector.isVisible,
    togglePanel,
  ]);

  const generateAutoTitle = (
    item: Condition | Effect,
    typeDefinition: GlobalConditionTypeDefinition | GlobalEffectTypeDefinition,
    isCondition: boolean,
  ): string => {
    const baseLabel = typeDefinition.label;
    const params: Record<string, unknown> = {};
    Object.entries(item.params).map(([key, object]) => {
      params[key] = object.value;
    });

    if (!params || Object.keys(params).length === 0) {
      return baseLabel;
    }

    const prefix = isCondition ? "If " : "";
    const skipValues = [
      "none",
      "dont_change",
      "no_edition",
      "remove",
      "any",
      "specific",
    ];
    const processedParams = new Set<string>();

    let title = "";

    if (params.operator && params !== undefined) {
      const operatorMap: Record<string, string> = {
        equals: "=",
        not_equals: "≠",
        greater_than: ">",
        less_than: "<",
        greater_equals: "≥",
        less_equals: "≤",
      };
      const op =
        params.operator &&
        Object.prototype.hasOwnProperty.call(
          operatorMap,
          params.operator as string,
        )
          ? operatorMap[params.operator as string]
          : params.operator;

      let valueDisplay = params.value;
      if (
        typeDefinition.id === "player_money" ||
        typeDefinition.id === "add_dollars"
      ) {
        valueDisplay = `$${params.value}`;
      }

      title = `${prefix}${baseLabel
        .replace("Player ", "")
        .replace("Remaining ", "")} ${op} ${valueDisplay}`;
      processedParams.add("operator");
      processedParams.add("value");
    } else if (params.value !== undefined && !params.operator) {
      title = `${prefix}${baseLabel} = ${params.value}`;
      processedParams.add("value");
    } else if (params.specific_rank || params.rank_group) {
      const rank = params.specific_rank || params.rank_group;
      title = `${prefix}Card Rank = ${rank}`;
      processedParams.add("specific_rank");
      processedParams.add("rank_group");
    } else if (params.specific_suit || params.suit_group) {
      const suit = params.specific_suit || params.suit_group;
      title = `${prefix}Card Suit = ${suit}`;
      processedParams.add("specific_suit");
      processedParams.add("suit_group");
    } else if (!isCondition && params.operation && params.value !== undefined) {
      const operationMap: { [key: string]: string } = {
        add: "+",
        subtract: "-",
        set: "Set to",
      };
      const op = operationMap[params.operation as string] || params.operation;
      const target = baseLabel
        .replace("Edit ", "")
        .replace("Add ", "")
        .replace("Apply ", "");
      title = `${op} ${params.value} ${target}`;
      processedParams.add("operation");
      processedParams.add("value");
    } else if (!isCondition) {
      if (params.value !== undefined && baseLabel.startsWith("Add")) {
        let valueDisplay = params.value;
        if (typeDefinition.id === "add_dollars") {
          valueDisplay = `$${params.value}`;
        }
        title = `Add ${valueDisplay} ${baseLabel.replace("Add ", "")}`;
        processedParams.add("value");
      } else if (params.value !== undefined && baseLabel.startsWith("Apply")) {
        title = `Apply ${params.value}x ${baseLabel
          .replace("Apply x", "")
          .replace("Apply ", "")}`;
        processedParams.add("value");
      } else if (params.repetitions !== undefined) {
        title = `Retrigger ${params.repetitions}x`;
        processedParams.add("repetitions");
      } else if (
        typeDefinition.id === "level_up_hand" &&
        params.value !== undefined
      ) {
        title = `Level Up Hand ${params.value}x`;
        processedParams.add("value");
      } else {
        title = baseLabel;
      }
    } else {
      title = baseLabel;
    }
    const additionalParams: string[] = [];

    Object.entries(params).forEach(([key, value]) => {
      if (
        processedParams.has(key) ||
        !value ||
        skipValues.includes(value as string)
      ) {
        return;
      }
      const stringValue = value as string;
      if (
        key === "suit" ||
        key === "rank" ||
        key === "enhancement" ||
        key === "seal" ||
        key === "edition"
      ) {
        if (stringValue === "random") {
          additionalParams.push("random " + key);
        } else {
          additionalParams.push(stringValue);
        }
      } else if (key === "joker_type" && stringValue === "random") {
        additionalParams.push("random joker");
      } else if (key === "joker_key" && stringValue !== "j_joker") {
        additionalParams.push(stringValue);
      } else if (key === "rarity" && stringValue !== "random") {
        additionalParams.push(stringValue);
      } else if (key === "is_negative" && stringValue === "negative") {
        additionalParams.push("negative");
      } else if (key === "tarot_card" && stringValue !== "random") {
        additionalParams.push(stringValue.replace("_", " "));
      } else if (key === "planet_card" && stringValue !== "random") {
        additionalParams.push(stringValue.replace("_", " "));
      } else if (key === "spectral_card" && stringValue !== "random") {
        additionalParams.push(stringValue.replace("_", " "));
      } else if (key === "consumable_type" && stringValue !== "random") {
        additionalParams.push(stringValue);
      } else if (key === "specific_card" && stringValue !== "random") {
        additionalParams.push(stringValue.replace("_", " "));
      } else if (key === "specific_tag") {
        additionalParams.push(stringValue.replace("_", " "));
      } else if (key === "selection_method" && stringValue !== "random") {
        additionalParams.push(stringValue + " selection");
      } else if (key === "position" && stringValue !== "first") {
        additionalParams.push(stringValue + " position");
      } else if (key === "hand_selection" && stringValue !== "current") {
        additionalParams.push(stringValue + " hand");
      } else if (key === "specific_hand") {
        additionalParams.push(stringValue.toLowerCase());
      } else if (key === "card_scope" && stringValue !== "scoring") {
        additionalParams.push(stringValue + " cards");
      } else if (key === "quantifier" && stringValue !== "all") {
        additionalParams.push(stringValue.replace("_", " "));
      } else if (key === "count" && !title.includes(stringValue)) {
        additionalParams.push(stringValue + " cards");
      } else if (key === "property_type") {
        additionalParams.push("by " + stringValue);
      } else if (key === "size_type" && stringValue !== "remaining") {
        additionalParams.push(stringValue);
      } else if (key === "blind_type") {
        additionalParams.push(stringValue + " blind");
      } else if (key === "card_index" && stringValue !== "any") {
        if (stringValue === "1") additionalParams.push("1st card");
        else if (stringValue === "2") additionalParams.push("2nd card");
        else if (stringValue === "3") additionalParams.push("3rd card");
        else if (stringValue === "4") additionalParams.push("4th card");
        else if (stringValue === "5") additionalParams.push("5th card");
        else additionalParams.push(stringValue + " card");
      } else if (key === "card_rank" && stringValue !== "any") {
        additionalParams.push("rank " + stringValue);
      } else if (key === "card_suit" && stringValue !== "any") {
        additionalParams.push("suit " + stringValue);
      } else if (
        key === "new_rank" ||
        key === "new_suit" ||
        key === "new_enhancement" ||
        key === "new_seal" ||
        key === "new_edition"
      ) {
        const cleanKey = key.replace("new_", "");
        additionalParams.push("→ " + cleanKey + " " + stringValue);
      }
    });

    if (additionalParams.length > 0) {
      title += ", " + additionalParams.join(", ");
    }

    return title;
  };

  const updateRulePosition = (
    ruleId: string,
    position: { x: number; y: number },
  ) => {
    const snappedPosition = gridSnapping
      ? {
          x: Math.round(position.x / 20) * 20,
          y: Math.round(position.y / 20) * 20,
        }
      : position;
    setRules((prev) =>
      prev.map((rule) =>
        rule.id === ruleId ? { ...rule, position: snappedPosition } : rule,
      ),
    );
  };

  const duplicateRule = (ruleId: string) => {
    const newRuleId = crypto.randomUUID();
    setRules((prevRules) => {
      const ruleToDuplicate = prevRules.find((r) => r.id === ruleId);
      if (!ruleToDuplicate) {
        return prevRules;
      }

      const newRule = {
        ...ruleToDuplicate,
        id: newRuleId,
        position: {
          x: (ruleToDuplicate.position?.x || 0) + 30,
          y: (ruleToDuplicate.position?.y || 0) + 30,
        },
        conditionGroups: ruleToDuplicate.conditionGroups.map((group) => ({
          ...group,
          id: crypto.randomUUID(),
          conditions: group.conditions.map((condition) => ({
            ...condition,
            id: crypto.randomUUID(),
          })),
        })),
        effects: ruleToDuplicate.effects.map((effect) => ({
          ...effect,
          id: crypto.randomUUID(),
        })),
        randomGroups: ruleToDuplicate.randomGroups.map((group) => ({
          ...group,
          id: crypto.randomUUID(),
        })),
        loops: ruleToDuplicate.loops.map((group) => ({
          ...group,
          id: crypto.randomUUID(),
        })),
      };
      setSelectedItem({ type: "trigger", ruleId: newRuleId });
      return [...prevRules, newRule];
    });
  };

  const addTrigger = (triggerId: string) => {
    const centerPos = getCenterPosition();
    const newRule: Rule = {
      id: crypto.randomUUID(),
      trigger: triggerId,
      blueprintCompatible: true,
      conditionGroups: [],
      effects: [],
      randomGroups: [],
      loops: [],
      position: centerPos,
    };
    setRules((prev) => [...prev, newRule]);
    setSelectedItem({ type: "trigger", ruleId: newRule.id });
  };

  const addCondition = useCallback(
    (conditionType: string) => {
      if (!selectedItem) return;

      const conditionTypeData = getConditionType(conditionType);
      const defaultParams: Record<
        string,
        { value: unknown; valueType?: string }
      > = {};

      if (conditionTypeData) {
        conditionTypeData.params.forEach((param) => {
          const defaultValue = param.default ?? undefined;
          defaultParams[param.id] = {
            value: defaultValue,
            valueType: detectValueType(defaultValue),
          };
        });
      }
      const newCondition: Condition = {
        id: crypto.randomUUID(),
        type: conditionType,
        negate: false,
        params: defaultParams,
      };

      let targetGroupId = selectedItem.groupId;

      setRules((prev) => {
        return prev.map((rule) => {
          if (rule.id === selectedItem.ruleId) {
            if (selectedItem.groupId && selectedItem.type === "condition") {
              return {
                ...rule,
                conditionGroups: rule.conditionGroups.map((group) =>
                  group.id === selectedItem.groupId
                    ? {
                        ...group,
                        conditions: [...group.conditions, newCondition],
                      }
                    : group,
                ),
              };
            }
            if (rule.conditionGroups.length === 0) {
              const newGroupId = crypto.randomUUID();
              targetGroupId = newGroupId;
              return {
                ...rule,
                conditionGroups: [
                  {
                    id: newGroupId,
                    operator: "and",
                    conditions: [newCondition],
                  },
                ],
              };
            } else {
              targetGroupId = rule.conditionGroups[0].id;
              return {
                ...rule,
                conditionGroups: rule.conditionGroups.map((group, index) => {
                  if (index === 0) {
                    return {
                      ...group,
                      conditions: [...group.conditions, newCondition],
                    };
                  }
                  return group;
                }),
              };
            }
          }
          return rule;
        });
      });
      setSelectedItem({
        type: "condition",
        ruleId: selectedItem.ruleId,
        itemId: newCondition.id,
        groupId: targetGroupId,
      });
    },
    [selectedItem, getConditionType],
  );

  const addConditionGroup = (ruleId: string) => {
    const newGroup = {
      id: crypto.randomUUID(),
      operator: "and" as const,
      conditions: [],
    };
    setRules((prev) =>
      prev.map((rule) => {
        if (rule.id === ruleId) {
          return {
            ...rule,
            conditionGroups: [...rule.conditionGroups, newGroup],
          };
        }
        return rule;
      }),
    );
    setSelectedItem({
      type: "condition",
      ruleId: ruleId,
      groupId: newGroup.id,
    });
  };

  const deleteConditionGroup = (ruleId: string, groupId: string) => {
    setRules((prev) =>
      prev.map((rule) => {
        if (rule.id === ruleId) {
          return {
            ...rule,
            conditionGroups: rule.conditionGroups.filter(
              (group) => group.id !== groupId,
            ),
          };
        }
        return rule;
      }),
    );
    if (selectedItem && selectedItem.groupId === groupId) {
      setSelectedItem({ type: "trigger", ruleId });
    }
  };

  const toggleGroupOperator = (ruleId: string, groupId: string) => {
    setRules((prev) =>
      prev.map((rule) => {
        if (rule.id === ruleId) {
          return {
            ...rule,
            conditionGroups: rule.conditionGroups.map((group) => {
              if (group.id === groupId) {
                return {
                  ...group,
                  operator: group.operator === "and" ? "or" : "and",
                };
              }
              return group;
            }),
          };
        }
        return rule;
      }),
    );
  };

  const addRandomGroup = (ruleId: string) => {
    const newGroup: RandomGroup = {
      id: crypto.randomUUID(),
      chance_numerator: { value: 1, valueType: "number" },
      chance_denominator: { value: 4, valueType: "number" },
      respect_probability_effects: true,
      custom_key: "",
      effects: [],
    };
    setRules((prev) =>
      prev.map((rule) => {
        if (rule.id === ruleId) {
          return {
            ...rule,
            randomGroups: [...rule.randomGroups, newGroup],
          };
        }
        return rule;
      }),
    );
    setSelectedItem({
      type: "randomgroup",
      ruleId: ruleId,
      randomGroupId: newGroup.id,
    });
  };

  const addLoopGroup = (ruleId: string) => {
    const newLoop: LoopGroup = {
      id: crypto.randomUUID(),
      repetitions: { value: 1, valueType: "number" },
      effects: [],
    };
    setRules((prev) =>
      prev.map((rule) => {
        if (rule.id === ruleId) {
          return {
            ...rule,
            loops: [...rule.loops, newLoop],
          };
        }
        return rule;
      }),
    );
    setSelectedItem({
      type: "loopgroup",
      ruleId: ruleId,
      loopGroupId: newLoop.id,
    });
  };

  const toggleBlueprintCompatibility = (ruleId: string) => {
    setRules((prev) =>
      prev.map((rule) => {
        if (rule.id === ruleId) {
          return {
            ...rule,
            blueprintCompatible: !rule.blueprintCompatible,
          };
        }
        return rule;
      }),
    );
  };

  const deleteRandomGroup = (ruleId: string, randomGroupId: string) => {
    setRules((prev) =>
      prev.map((rule) => {
        if (rule.id === ruleId) {
          const groupToDelete = rule.randomGroups.find(
            (g) => g.id === randomGroupId,
          );
          return {
            ...rule,
            randomGroups: rule.randomGroups.filter(
              (group) => group.id !== randomGroupId,
            ),
            effects: groupToDelete
              ? [...rule.effects, ...groupToDelete.effects]
              : rule.effects,
          };
        }
        return rule;
      }),
    );
    if (selectedItem && selectedItem.randomGroupId === randomGroupId) {
      setSelectedItem({ type: "trigger", ruleId });
    }
  };

  const deleteLoopGroup = (ruleId: string, loopGroupId: string) => {
    setRules((prev) =>
      prev.map((rule) => {
        if (rule.id === ruleId) {
          const groupToDelete = rule.loops.find((g) => g.id === loopGroupId);
          return {
            ...rule,
            loops: rule.loops.filter((group) => group.id !== loopGroupId),
            effects: groupToDelete
              ? [...rule.effects, ...groupToDelete.effects]
              : rule.effects,
          };
        }
        return rule;
      }),
    );
    if (selectedItem && selectedItem.loopGroupId === loopGroupId) {
      setSelectedItem({ type: "trigger", ruleId });
    }
  };

  const updateRandomGroup = (
    ruleId: string,
    randomGroupId: string,
    updates: Partial<RandomGroup>,
  ) => {
    setRules((prev) =>
      prev.map((rule) => {
        if (rule.id === ruleId) {
          return {
            ...rule,
            randomGroups: rule.randomGroups.map((group) =>
              group.id === randomGroupId ? { ...group, ...updates } : group,
            ),
          };
        }
        return rule;
      }),
    );
  };

  const updateLoopGroup = (
    ruleId: string,
    loopGroupId: string,
    updates: Partial<LoopGroup>,
  ) => {
    setRules((prev) =>
      prev.map((rule) => {
        if (rule.id === ruleId) {
          return {
            ...rule,
            loops: rule.loops.map((group) =>
              group.id === loopGroupId ? { ...group, ...updates } : group,
            ),
          };
        }
        return rule;
      }),
    );
  };

  const createRandomGroupFromEffect = (ruleId: string, effectId: string) => {
    const newGroup: RandomGroup = {
      id: crypto.randomUUID(),
      chance_numerator: { value: 1, valueType: "number" },
      chance_denominator: { value: 4, valueType: "number" },
      respect_probability_effects: true,
      custom_key: "",
      effects: [],
    };
    setRules((prev) =>
      prev.map((rule) => {
        if (rule.id !== ruleId) return rule;
        let movedEffect: Effect | null = null;
        const updatedRule = { ...rule };

        updatedRule.effects = rule.effects.filter((effect) => {
          if (effect.id === effectId) {
            movedEffect = effect;
            return false;
          }
          return true;
        });

        updatedRule.randomGroups = rule.randomGroups.map((group) => ({
          ...group,
          effects: group.effects.filter((effect) => {
            if (effect.id === effectId) {
              movedEffect = effect;
              return false;
            }
            return true;
          }),
        }));

        if (movedEffect) {
          newGroup.effects = [movedEffect];
          updatedRule.randomGroups = [...updatedRule.randomGroups, newGroup];
        }

        return updatedRule;
      }),
    );
    setSelectedItem({
      type: "randomgroup",
      ruleId: ruleId,
      randomGroupId: newGroup.id,
    });
  };

  const createLoopGroupFromEffect = (ruleId: string, effectId: string) => {
    const newGroup: LoopGroup = {
      id: crypto.randomUUID(),
      repetitions: { value: 1, valueType: "number" },
      effects: [],
    };
    setRules((prev) =>
      prev.map((rule) => {
        if (rule.id !== ruleId) return rule;
        let movedEffect: Effect | null = null;
        const updatedRule = { ...rule };

        updatedRule.effects = rule.effects.filter((effect) => {
          if (effect.id === effectId) {
            movedEffect = effect;
            return false;
          }
          return true;
        });

        updatedRule.loops = rule.loops.map((group) => ({
          ...group,
          effects: group.effects.filter((effect) => {
            if (effect.id === effectId) {
              movedEffect = effect;
              return false;
            }
            return true;
          }),
        }));

        if (movedEffect) {
          newGroup.effects = [movedEffect];
          updatedRule.loops = [...updatedRule.loops, newGroup];
        }

        return updatedRule;
      }),
    );
    setSelectedItem({
      type: "randomgroup",
      ruleId: ruleId,
      randomGroupId: newGroup.id,
    });
  };

  const addEffect = (effectType: string) => {
    if (!selectedItem) return;

    const effectTypeData = getEffectType(effectType);
    const defaultParams: Record<
      string,
      { value: unknown; valueType?: string }
    > = {};

    if (effectTypeData) {
      effectTypeData.params.forEach((param) => {
        const defaultValue = param.default ?? undefined;
        defaultParams[param.id] = {
          value: defaultValue,
          valueType: detectValueType(defaultValue),
        };
      });
    }

    const newEffect: Effect = {
      id: crypto.randomUUID(),
      type: effectType,
      params: defaultParams,
    };

    setRules((prev) =>
      prev.map((rule) => {
        if (rule.id === selectedItem.ruleId) {
          if (selectedItem.randomGroupId) {
            return {
              ...rule,
              randomGroups: rule.randomGroups.map((group) =>
                group.id === selectedItem.randomGroupId
                  ? { ...group, effects: [...group.effects, newEffect] }
                  : group,
              ),
            };
          } else if (selectedItem.loopGroupId) {
            return {
              ...rule,
              loops: rule.loops.map((group) =>
                group.id === selectedItem.loopGroupId
                  ? { ...group, effects: [...group.effects, newEffect] }
                  : group,
              ),
            };
          } else {
            return {
              ...rule,
              effects: [...rule.effects, newEffect],
            };
          }
        }
        return rule;
      }),
    );
    setSelectedItem({
      type: "effect",
      ruleId: selectedItem.ruleId,
      itemId: newEffect.id,
      randomGroupId: selectedItem.randomGroupId,
    });
  };

  const updateCondition = (
    ruleId: string,
    conditionId: string,
    updates: Partial<Condition>,
  ) => {
    setRules((prev) =>
      prev.map((rule) => {
        if (rule.id === ruleId) {
          return {
            ...rule,
            conditionGroups: rule.conditionGroups.map((group) => ({
              ...group,
              conditions: group.conditions.map((condition) =>
                condition.id === conditionId
                  ? { ...condition, ...updates }
                  : condition,
              ),
            })),
          };
        }
        return rule;
      }),
    );
  };

  const updateEffect = (
    ruleId: string,
    effectId: string,
    updates: Partial<Effect>,
  ) => {
    setRules((prev) =>
      prev.map((rule) => {
        if (rule.id === ruleId) {
          const updatedRule = { ...rule };
          updatedRule.effects = rule.effects.map((effect) =>
            effect.id === effectId ? { ...effect, ...updates } : effect,
          );
          updatedRule.randomGroups = rule.randomGroups.map(
            (group) => ({
              ...group,
              effects: group.effects.map((effect) =>
                effect.id === effectId ? { ...effect, ...updates } : effect,
              ),
            }),
            (updatedRule.loops = rule.loops.map((group) => ({
              ...group,
              effects: group.effects.map((effect) =>
                effect.id === effectId ? { ...effect, ...updates } : effect,
              ),
            }))),
          );
          return updatedRule;
        }
        return rule;
      }),
    );
  };

  const deleteRule = (ruleId: string) => {
    setRules((prev) => prev.filter((rule) => rule.id !== ruleId));
    if (selectedItem && selectedItem.ruleId === ruleId) {
      setSelectedItem(null);
    }
  };

  const deleteCondition = (ruleId: string, conditionId: string) => {
    setRules((prev) =>
      prev.map((rule) => {
        if (rule.id === ruleId) {
          return {
            ...rule,
            conditionGroups: rule.conditionGroups
              .map((group) => ({
                ...group,
                conditions: group.conditions.filter(
                  (condition) => condition.id !== conditionId,
                ),
              }))
              .filter((group) => group.conditions.length > 0),
          };
        }
        return rule;
      }),
    );
    if (selectedItem && selectedItem.itemId === conditionId) {
      setSelectedItem({ type: "trigger", ruleId });
    }
  };

  const deleteEffect = (ruleId: string, effectId: string) => {
    setRules((prev) =>
      prev.map((rule) => {
        if (rule.id === ruleId) {
          return {
            ...rule,
            effects: rule.effects.filter((effect) => effect.id !== effectId),
            randomGroups: rule.randomGroups.map((group) => ({
              ...group,
              effects: group.effects.filter((effect) => effect.id !== effectId),
            })),
            loops: rule.loops.map((group) => ({
              ...group,
              effects: group.effects.filter((effect) => effect.id !== effectId),
            })),
          };
        }
        return rule;
      }),
    );
    if (selectedItem && selectedItem.itemId === effectId) {
      setSelectedItem({ type: "trigger", ruleId });
    }
  };

  const updateConditionOperator = (
    ruleId: string,
    conditionId: string,
    operator: "and" | "or",
  ) => {
    setRules((prev) =>
      prev.map((rule) => {
        if (rule.id === ruleId) {
          return {
            ...rule,
            conditionGroups: rule.conditionGroups.map((group) => ({
              ...group,
              conditions: group.conditions.map((condition) =>
                condition.id === conditionId
                  ? { ...condition, operator }
                  : condition,
              ),
            })),
          };
        }
        return rule;
      }),
    );
  };

  const getParameterCount = (
    params: Record<string, { value: unknown; valueType?: string }>,
  ): number => {
    return Object.keys(params).length;
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over, delta } = event;
    const activeId = active.id as string;

    if (activeId.startsWith("panel-")) {
      const panelId = activeId.replace("panel-", "");
      const currentPanel = panels[panelId];
      if (delta && currentPanel) {
        const newPosition = {
          x: Math.max(0, currentPanel.position.x + delta.x),
          y: Math.max(0, currentPanel.position.y + delta.y),
        };
        updatePanelPosition(panelId, newPosition);
      }
      setActiveId(null);
      return;
    }

    // Dragging from block palette to a rule card drop zone.
    if (activeId.startsWith("palette:")) {
      const overId = (over?.id as string | undefined) || "";
      if (overId.startsWith("drop:rule:")) {
        const parts = activeId.split(":");
        const blockType = parts[1] as "trigger" | "condition" | "effect";
        const blockId = parts.slice(2).join(":");
        const ruleId = overId.split(":")[2];

        if (blockType === "trigger") {
          setRules((prev) =>
            prev.map((rule) =>
              rule.id === ruleId ? { ...rule, trigger: blockId } : rule,
            ),
          );
          setSelectedItem({ type: "trigger", ruleId });
        } else if (blockType === "condition") {
          addConditionToRule(ruleId, blockId);
        } else if (blockType === "effect") {
          addEffectToRule(ruleId, blockId);
        }
      }
      setActiveId(null);
      return;
    }

    if (!over || active.id === over.id) {
      return;
    }

    const overId = over.id as string;

    setRules((currentRules) => {
      let activeRule: Rule | undefined;
      let containerWithActive: (Condition[] | Effect[]) | undefined;
      let containerWithOver: (Condition[] | Effect[]) | undefined;

      for (const rule of currentRules) {
        for (const group of rule.conditionGroups) {
          if (group.conditions.some((c) => c.id === activeId)) {
            activeRule = rule;
            containerWithActive = group.conditions;
          }
          if (group.conditions.some((c) => c.id === overId)) {
            containerWithOver = group.conditions;
          }
        }

        if (rule.effects.some((e) => e.id === activeId)) {
          activeRule = rule;
          containerWithActive = rule.effects;
        }
        if (rule.effects.some((e) => e.id === overId)) {
          containerWithOver = rule.effects;
        }

        for (const group of rule.randomGroups) {
          if (group.effects.some((e) => e.id === activeId)) {
            activeRule = rule;
            containerWithActive = group.effects;
          }
          if (group.effects.some((e) => e.id === overId)) {
            containerWithOver = group.effects;
          }
        }

        if (activeRule) break;
      }

      if (
        !activeRule ||
        !containerWithActive ||
        !containerWithOver ||
        containerWithActive !== containerWithOver
      ) {
        return currentRules;
      }

      const oldIndex = containerWithActive.findIndex((i) => i.id === activeId);
      const newIndex = containerWithOver.findIndex((i) => i.id === overId);

      if (oldIndex === -1 || newIndex === -1) {
        return currentRules;
      }

      let reorderedItems: Condition[] | Effect[];
      if (
        activeRule.conditionGroups.some(
          (group) => group.conditions === containerWithActive,
        )
      ) {
        reorderedItems = arrayMove(
          containerWithActive as Condition[],
          oldIndex,
          newIndex,
        );
      } else {
        reorderedItems = arrayMove(
          containerWithActive as Effect[],
          oldIndex,
          newIndex,
        );
      }

      return currentRules.map((rule) => {
        if (rule.id !== activeRule?.id) {
          return rule;
        }
        if (
          activeRule.conditionGroups.some(
            (group) => group.conditions === containerWithActive,
          )
        ) {
          return {
            ...rule,
            conditionGroups: rule.conditionGroups.map((group) =>
              group.conditions === containerWithActive
                ? { ...group, conditions: reorderedItems as Condition[] }
                : group,
            ),
          };
        } else if (rule.effects === containerWithActive) {
          return {
            ...rule,
            effects: reorderedItems as Effect[],
          };
        } else {
          return {
            ...rule,
            randomGroups: rule.randomGroups.map((group) =>
              group.effects === containerWithActive
                ? { ...group, effects: reorderedItems as Effect[] }
                : group,
            ),
          };
        }
      });
    });
  };

  const createAlternatingDotPattern = () => {
    const dotSize = 1.15;
    return `
      radial-gradient(circle, rgba(124, 149, 186, 0.42) ${dotSize}px, transparent ${dotSize}px)
    `;
  };

  const modeLabel = itemType.charAt(0).toUpperCase() + itemType.slice(1);

  const handleGameVariableApplied = useCallback(() => {
    setSelectedGameVariable(null);
  }, []);

  const selectedRule = getSelectedRule(rules, selectedItem);
  const selectedCondition = getSelectedCondition(rules, selectedItem);
  const selectedEffect = getSelectedEffect(rules, selectedItem);
  const selectedRandomGroup = getSelectedRandomGroup(rules, selectedItem);
  const selectedLoopGroup = getSelectedLoopGroup(rules, selectedItem);

  if (!isOpen) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 top-9 flex bg-background items-center justify-center z-120 font-lexend">
      <div
        ref={modalRef}
        className="bg-background w-full h-full overflow-hidden flex flex-col"
      >
        <div className="relative h-28 bg-background/95 backdrop-blur-md border-b border-border shadow-sm z-50">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2 pointer-events-none">
            <Terminal className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
              Rule Builder
            </span>
            <span className="text-[11px] text-muted-foreground hidden xl:block">
              Pan: {Math.round(panState.x)}, {Math.round(panState.y)}
            </span>
          </div>
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-2">
            <IconButton
              icon={CornersIn}
              onClick={handleRecenter}
              tooltip="Recenter View"
            />
            <IconButton
              icon={Browser}
              onClick={handleResetPosition}
              tooltip="Reset Window Position"
            />
            <IconButton
              icon={GridFour}
              onClick={() => {
                setUserConfig((prevConfig) => ({
                  ...prevConfig,
                  defaultGridSnap: !gridSnapping,
                }));
                setGridSnapping((prev) => !prev);
              }}
              tooltip="Toggle Grid Snapping"
              shortcut="S"
              isActive={gridSnapping}
              className={
                gridSnapping
                  ? "text-mint-light hover:text-mint-lighter"
                  : undefined
              }
            />
            <IconButton
              icon={MagnifyingGlassMinus}
              onClick={() => handleGridZoomChange("out")}
              tooltip="Zoom Out"
              shortcut="-"
            />
            <IconButton
              icon={MagnifyingGlassPlus}
              onClick={() => handleGridZoomChange("in")}
              tooltip="Zoom In"
              shortcut="+"
            />
            <span className="text-[11px] text-muted-foreground w-12 text-center">
              {Math.round(panState.scale * 100)}%
            </span>
            <div className="w-px h-5 bg-border" />
            <Button
              variant="primary"
              size="sm"
              onClick={handleSaveAndClose}
              icon={<CheckCircle className="h-4 w-4" />}
              className="text-xs cursor-pointer"
            >
              Save Changes
            </Button>
          </div>
          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 pointer-events-none">
            <span className="text-xs font-medium text-foreground/70 uppercase tracking-wide">
              Mode
            </span>
            <span className="text-xs font-semibold text-foreground/90">
              {modeLabel}
            </span>
            <ItemTypeBadge itemType={itemType} />
          </div>
        </div>
        <div className="grow relative overflow-hidden">
          <div
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{
              backgroundImage: createAlternatingDotPattern(),
              backgroundSize: `${24 * panState.scale}px ${24 * panState.scale}px`,
              backgroundPosition: `${panState.x}px ${panState.y}px`,
              backgroundColor: "hsl(var(--background))",
            }}
          />
          {isInitialLoadComplete &&
            rules.length === 0 &&
            showNoRulesMessage && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{
                  duration: 0.4,
                  ease: "easeOut",
                  delay: 0.1,
                }}
                className="absolute inset-0 flex items-center justify-center z-40"
              >
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.3,
                    delay: 0.2,
                    ease: "easeOut",
                  }}
                  className="text-center bg-card/95 backdrop-blur-sm rounded-xl p-8 border border-border shadow-xl"
                >
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4, duration: 0.3 }}
                    className="text-foreground text-lg mb-3"
                  >
                    No Rules Created
                  </motion.div>
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5, duration: 0.3 }}
                    className="text-muted-foreground text-sm max-w-md"
                  >
                    Select a trigger from the Block Palette to create your first
                    rule.
                  </motion.p>
                </motion.div>
              </motion.div>
            )}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            modifiers={
              activeId &&
              (activeId.startsWith("panel-") || activeId.startsWith("palette:"))
                ? []
                : [restrictToVerticalAxis]
            }
          >
            <TransformWrapper
              ref={transformRef}
              initialScale={1}
              initialPositionX={0}
              initialPositionY={0}
              minScale={0.5}
              maxScale={2.4}
              smooth={false}
              centerOnInit={false}
              limitToBounds={false}
              wheel={{
                disabled: false,
                step: 0.25,
                smoothStep: 0.25,
                wheelDisabled: false,
              }}
              pinch={{
                disabled: false,
              }}
              doubleClick={{
                disabled: true,
              }}
              panning={{
                velocityDisabled: true,
              }}
              onTransformed={(_, state) => {
                setPanState({
                  x: state.positionX,
                  y: state.positionY,
                  scale: state.scale,
                });
              }}
            >
              <TransformComponent
                wrapperClass="w-full h-full"
                contentClass="relative"
                wrapperStyle={{
                  width: "100%",
                  height: "100%",
                  overflow: "hidden",
                }}
                contentStyle={{
                  width: "5600px",
                  height: "3200px",
                }}
              >
                <div className="relative z-10">
                  <div className="p-6 min-h-full">
                    <div className="relative">
                      {rules.map((rule, index) => (
                        <div
                          key={rule.id}
                          className="absolute"
                          style={{
                            left: rule.position?.x || 0,
                            top: rule.position?.y || 0,
                            zIndex:
                              selectedItem?.ruleId === rule.id
                                ? 50 + index
                                : 20 + index,
                          }}
                        >
                          <RuleCard
                            rule={rule}
                            ruleIndex={index}
                            selectedItem={selectedItem}
                            onSelectItem={setSelectedItem}
                            onDuplicateRule={duplicateRule}
                            onDeleteRule={deleteRule}
                            onDeleteCondition={deleteCondition}
                            onDeleteConditionGroup={deleteConditionGroup}
                            onDeleteEffect={deleteEffect}
                            onAddConditionGroup={addConditionGroup}
                            onAddRandomGroup={addRandomGroup}
                            onAddLoop={addLoopGroup}
                            onToggleBlueprintCompatibility={
                              toggleBlueprintCompatibility
                            }
                            onDeleteRandomGroup={deleteRandomGroup}
                            onDeleteLoopGroup={deleteLoopGroup}
                            onToggleGroupOperator={toggleGroupOperator}
                            onUpdatePosition={updateRulePosition}
                            isRuleSelected={selectedItem?.ruleId === rule.id}
                            item={item as any}
                            itemType={itemType}
                            generateConditionTitle={(condition) => {
                              const conditionType = getConditionType(
                                condition.type,
                              );
                              if (!conditionType) return condition.type; // Fallback if type not found
                              return generateAutoTitle(
                                condition,
                                conditionType,
                                true,
                              );
                            }}
                            generateEffectTitle={(effect) => {
                              const effectType = getEffectType(effect.type);
                              if (!effectType) return effect.type; // Fallback if type not found
                              return generateAutoTitle(
                                effect,
                                effectType,
                                false,
                              );
                            }}
                            getParameterCount={getParameterCount}
                            onUpdateConditionOperator={updateConditionOperator}
                            onRuleDoubleClick={() => {
                              setInspectorIsOpen(true);
                            }}
                            scale={panState.scale}
                            isPaletteDragging={
                              !!activeId && activeId.startsWith("palette:")
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </TransformComponent>
            </TransformWrapper>

            {panels.blockPalette.isVisible && (
              <BlockPalette
                position={panels.blockPalette.position}
                selectedRule={selectedRule}
                onAddTrigger={addTrigger}
                onAddCondition={addCondition}
                onAddEffect={addEffect}
                onClose={() => togglePanel("blockPalette")}
                onPositionChange={(position) =>
                  updatePanelPosition("blockPalette", position)
                }
                itemType={itemType}
              />
            )}
            {itemType !== "consumable" && panels.variables?.isVisible && (
              <Variables
                position={panels.variables.position}
                item={item as any}
                onUpdateItem={onUpdateItem}
                onClose={() => togglePanel("variables")}
                onPositionChange={(position) =>
                  updatePanelPosition("variables", position)
                }
              />
            )}
            {panels.inspector.isVisible && (
              <Inspector
                position={panels.inspector.position}
                joker={item as any}
                selectedRule={selectedRule}
                selectedCondition={selectedCondition}
                selectedEffect={selectedEffect}
                selectedRandomGroup={selectedRandomGroup}
                selectedLoopGroup={selectedLoopGroup}
                onUpdateCondition={updateCondition}
                onUpdateEffect={updateEffect}
                onUpdateRandomGroup={updateRandomGroup}
                onUpdateLoopGroup={updateLoopGroup}
                onUpdateJoker={onUpdateItem as (updates: Partial<any>) => void}
                onClose={() => togglePanel("inspector")}
                onPositionChange={(position) =>
                  updatePanelPosition("inspector", position)
                }
                onToggleVariablesPanel={() => togglePanel("variables")}
                onToggleGameVariablesPanel={() => togglePanel("gameVariables")}
                onCreateRandomGroupFromEffect={createRandomGroupFromEffect}
                onCreateLoopGroupFromEffect={createLoopGroupFromEffect}
                selectedGameVariable={selectedGameVariable}
                onGameVariableApplied={handleGameVariableApplied}
                selectedItem={selectedItem}
                itemType={itemType}
              />
            )}

            {panels.gameVariables.isVisible && (
              <GameVariables
                position={panels.gameVariables.position}
                selectedGameVariable={selectedGameVariable}
                onSelectGameVariable={setSelectedGameVariable}
                onClose={() => togglePanel("gameVariables")}
                onPositionChange={(position) =>
                  updatePanelPosition("gameVariables", position)
                }
              />
            )}
            <FloatingDock
              panels={panels}
              onTogglePanel={togglePanel}
              itemType={itemType}
            />
          </DndContext>
        </div>
      </div>
    </div>
  );
};

export default RuleBuilder;
