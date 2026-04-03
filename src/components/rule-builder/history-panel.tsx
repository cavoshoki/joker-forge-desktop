import React from "react";
import {
  ClockCounterClockwise,
  PlusCircle,
  MinusCircle,
  PencilSimple,
  Shuffle,
} from "@phosphor-icons/react";
import type { Rule } from "./types";
import Panel from "./panel";

interface HistoryPanelProps {
  position: { x: number; y: number };
  entries: Rule[][];
  currentIndex: number;
  onRestoreAt: (index: number) => void;
  onClose: () => void;
  onPositionChange: (position: { x: number; y: number }) => void;
}

const summarizeSnapshot = (rules: Rule[]) => {
  const ruleCount = rules.length;
  const conditionCount = rules.reduce(
    (acc, rule) =>
      acc +
      rule.conditionGroups.reduce((inner, g) => inner + g.conditions.length, 0),
    0,
  );
  const effectCount = rules.reduce(
    (acc, rule) =>
      acc +
      rule.effects.length +
      rule.randomGroups.reduce((inner, g) => inner + g.effects.length, 0) +
      rule.loops.reduce((inner, g) => inner + g.effects.length, 0),
    0,
  );

  return { ruleCount, conditionCount, effectCount };
};

type HistoryActionType =
  | "initial"
  | "added"
  | "deleted"
  | "reordered"
  | "edited";

const ruleOrderFingerprint = (rules: Rule[]): string => {
  return rules.map((rule) => rule.id).join("|");
};

const detectActionType = (
  previous: Rule[] | undefined,
  current: Rule[],
): HistoryActionType => {
  if (!previous) return "initial";

  const prev = summarizeSnapshot(previous);
  const next = summarizeSnapshot(current);

  if (
    next.ruleCount > prev.ruleCount ||
    next.conditionCount > prev.conditionCount ||
    next.effectCount > prev.effectCount
  ) {
    return "added";
  }

  if (
    next.ruleCount < prev.ruleCount ||
    next.conditionCount < prev.conditionCount ||
    next.effectCount < prev.effectCount
  ) {
    return "deleted";
  }

  if (ruleOrderFingerprint(previous) !== ruleOrderFingerprint(current)) {
    return "reordered";
  }

  return "edited";
};

const actionPresentation = (action: HistoryActionType) => {
  switch (action) {
    case "initial":
      return {
        icon: ClockCounterClockwise,
        label: "Initial",
        iconClass: "text-muted-foreground",
      };
    case "added":
      return {
        icon: PlusCircle,
        label: "Added",
        iconClass: "text-jungle-green-300",
      };
    case "deleted":
      return {
        icon: MinusCircle,
        label: "Deleted",
        iconClass: "text-destructive",
      };
    case "reordered":
      return {
        icon: Shuffle,
        label: "Reordered",
        iconClass: "text-balatro-blue",
      };
    default:
      return {
        icon: PencilSimple,
        label: "Edited",
        iconClass: "text-amber-300",
      };
  }
};

const HistoryPanel: React.FC<HistoryPanelProps> = ({
  position,
  entries,
  currentIndex,
  onRestoreAt,
  onClose,
}) => {
  return (
    <Panel
      id="history"
      position={position}
      icon={ClockCounterClockwise}
      title="History"
      onClose={onClose}
      closeLabel="Close History"
      className="w-80 select-none max-h-[60vh]"
      contentClassName="p-2 overflow-y-auto custom-scrollbar"
    >
      <div>
        {entries.length === 0 ? (
          <div className="text-xs text-muted-foreground p-3">
            No history yet.
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {entries.map((snapshot, index) => {
              const isCurrent = index === currentIndex;
              const summary = summarizeSnapshot(snapshot);
              const action = detectActionType(entries[index - 1], snapshot);
              const presentation = actionPresentation(action);
              const ActionIcon = presentation.icon;

              return (
                <button
                  key={`history-${index}`}
                  onClick={() => onRestoreAt(index)}
                  className={`w-full text-left px-2.5 py-2 transition-colors cursor-pointer ${
                    isCurrent ? "bg-primary/10" : "hover:bg-accent/60"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <ActionIcon
                        className={`h-4 w-4 shrink-0 ${presentation.iconClass}`}
                      />
                      <span className="text-xs font-semibold text-foreground truncate">
                        {isCurrent
                          ? `${presentation.label} (Current)`
                          : `${presentation.label} - Step ${index + 1}`}
                      </span>
                    </div>
                    {isCurrent ? (
                      <span className="text-[10px] text-primary">Now</span>
                    ) : null}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    {summary.ruleCount}R / {summary.conditionCount}C /{" "}
                    {summary.effectCount}E
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Panel>
  );
};

export default HistoryPanel;
