import { useState, useRef, useEffect, ReactNode } from "react";
import { CurrencyDollar, Image, Trash } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { slugify } from "@/lib/balatro-utils";
import { RaritySelect } from "@/components/balatro/rarity-select";
import { ConsumableSetSelect } from "@/components/balatro/consumable-set-select";

export interface CardProperty {
  id: string;
  icon: ReactNode;
  label: string;
  isActive: boolean;
  variant:
    | "default"
    | "success"
    | "warning"
    | "info"
    | "purple"
    | "destructive";
  onClick: () => void;
}

export interface ActionConfig {
  id: string;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  variant?: "default" | "destructive" | "secondary" | "outline" | "ghost";
  badgeCount?: number;
}

interface GenericItemCardProps {
  image: ReactNode;
  overlayImage?: string;
  name: string;
  description: string;
  cost?: number;
  idValue?: number | string;
  badges?: ReactNode;
  properties?: CardProperty[];
  actions?: ActionConfig[];
  rarity?: number | string;
  consumableSet?: string;
  reforged?: boolean;
  onUpdate: (updates: {
    name?: string;
    description?: string;
    cost?: number;
    idValue?: number;
    objectKey?: string;
    rarity?: number | string;
    set?: string;
  }) => void;
  onDuplicate?: () => void;
  showPlaceholderPickerButton?: boolean;
  onOpenPlaceholderPicker?: () => void;
}

export function GenericItemCard({
  image,
  overlayImage,
  name,
  description,
  cost,
  idValue,
  badges,
  properties = [],
  actions = [],
  rarity,
  consumableSet,
  reforged = false,
  onUpdate,
  onDuplicate,
  showPlaceholderPickerButton = false,
  onOpenPlaceholderPicker,
}: GenericItemCardProps) {
  const isReadOnly = reforged;
  const [editingField, setEditingField] = useState<
    "none" | "name" | "desc" | "cost" | "id"
  >("none");
  const [tempValue, setTempValue] = useState("");
  const [tooltipStates, setTooltipStates] = useState<Record<string, boolean>>(
    {},
  );

  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editingField !== "none" && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editingField]);

  const startEdit = (
    field: "name" | "desc" | "cost" | "id",
    currentValue: string | number,
  ) => {
    if (isReadOnly) return;
    setTempValue(currentValue.toString());
    setEditingField(field);
  };

  const cancelEdit = () => {
    setEditingField("none");
    setTempValue("");
  };

  const saveEdit = () => {
    if (isReadOnly) {
      setEditingField("none");
      return;
    }
    if (editingField === "name") {
      if (tempValue.trim()) {
        onUpdate({
          name: tempValue,
          objectKey: slugify(tempValue),
        });
      }
    } else if (editingField === "desc") {
      onUpdate({ description: tempValue });
    } else if (editingField === "cost") {
      const val = parseInt(tempValue);
      if (!isNaN(val)) onUpdate({ cost: val });
    } else if (editingField === "id") {
      const val = parseInt(tempValue);
      if (!isNaN(val)) onUpdate({ idValue: val });
    }
    setEditingField("none");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      saveEdit();
    }
    if (e.key === "Escape") {
      cancelEdit();
    }
  };

  const deleteAction = actions.find(
    (a) => a.id === "delete" || a.variant === "destructive",
  );
  const duplicateAction = actions.find((a) => a.id === "duplicate");
  const textActionIds = new Set(["rules"]);
  const textActions = actions.filter(
    (a) => a !== deleteAction && textActionIds.has(a.id),
  );
  const iconActions = actions.filter(
    (a) =>
      a !== deleteAction && a !== duplicateAction && !textActionIds.has(a.id),
  );
  const rightAlignedIconActions = iconActions.filter((a) => a.id === "edit");
  const leadingIconActions = iconActions.filter((a) => a.id !== "edit");

  const getPropertyStyles = (
    isActive: boolean,
    variant: CardProperty["variant"],
  ) => {
    const base =
      "flex items-center justify-center h-10 w-10 rounded-xl transition-all duration-200 cursor-pointer border-2 outline-none focus:outline-none";
    if (!isActive)
      return cn(
        base,
        "bg-muted/30 border-transparent text-muted-foreground/30 hover:bg-muted hover:text-muted-foreground hover:border-border",
      );

    const variants = {
      success:
        "bg-green-500/10 text-green-500 border-green-500/30 hover:bg-green-500/20 hover:border-green-500",
      warning:
        "bg-orange-500/10 text-orange-500 border-orange-500/30 hover:bg-orange-500/20 hover:border-orange-500",
      info: "bg-blue-500/10 text-blue-500 border-blue-500/30 hover:bg-blue-500/20 hover:border-blue-500",
      purple:
        "bg-purple-500/10 text-purple-500 border-purple-500/30 hover:bg-purple-500/20 hover:border-purple-500",
      destructive:
        "bg-red-500/10 text-red-500 border-red-500/30 hover:bg-red-500/20 hover:border-red-500",
      default:
        "bg-primary/10 text-primary border-primary/30 hover:bg-primary/20 hover:border-primary",
    };
    return cn(base, variants[variant]);
  };

  return (
    <div
      className={cn(
        "group relative flex flex-col sm:flex-row gap-6 p-6 rounded-3xl bg-card transition-all duration-300 h-90",
        isReadOnly && "bg-card/70",
      )}
    >
      {deleteAction && (
        <div className="absolute top-4 right-4 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteAction.onClick();
                }}
                className="h-8 w-8 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 cursor-pointer rounded-lg"
              >
                <Trash weight="bold" className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left" className="font-bold text-red-500">
              {deleteAction.label}
            </TooltipContent>
          </Tooltip>
        </div>
      )}

      <div className="flex flex-col items-center gap-5 shrink-0 sm:w-56">
        {cost !== undefined && (
          <div className="relative z-10 -mb-12 w-full flex justify-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  onClick={() => {
                    if (isReadOnly) return;
                    if (editingField !== "cost") startEdit("cost", cost);
                  }}
                  className="h-10 px-4 flex items-center justify-center gap-1.5 rounded-lg bg-card border-2 border-yellow-500/30 text-yellow-500 font-bold text-xl shadow-sm cursor-pointer hover:border-yellow-500 hover:bg-yellow-500 hover:text-white transition-all group/cost"
                >
                  <CurrencyDollar className="h-5 w-5" weight="fill" />
                  {editingField === "cost" ? (
                    <input
                      ref={inputRef as React.RefObject<HTMLInputElement>}
                      type="text"
                      value={tempValue}
                      onChange={(e) => setTempValue(e.target.value)}
                      onBlur={saveEdit}
                      onKeyDown={handleKeyDown}
                      className="w-12 text-center font-bold text-xl text-yellow-500 group-hover/cost:text-white bg-transparent border-none p-0 outline-none focus:outline-none"
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span>{cost}</span>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent className="font-bold">Edit Cost</TooltipContent>
            </Tooltip>
          </div>
        )}

        <div className="relative w-55 h-90 [image-rendering:pixelated] -mt-8 flex items-center justify-center">
          {image}
          {overlayImage && (
            <img
              src={overlayImage}
              alt="Overlay"
              className="absolute inset-0 w-full h-full object-contain [image-rendering:pixelated] pointer-events-none z-10"
              draggable="false"
            />
          )}
        </div>

        <div className="relative z-10 -mt-20 w-full flex justify-center">
          {rarity !== undefined ? (
            isReadOnly ? (
              <Badge variant="secondary" className="font-bold uppercase">
                Rarity: {rarity}
              </Badge>
            ) : (
              <RaritySelect
                value={String(rarity)}
                onChange={(val) =>
                  onUpdate({
                    rarity: isNaN(Number(val)) ? val : Number(val),
                  })
                }
              />
            )
          ) : consumableSet !== undefined ? (
            isReadOnly ? (
              <Badge variant="secondary" className="font-bold uppercase">
                Set: {consumableSet}
              </Badge>
            ) : (
              <ConsumableSetSelect
                value={consumableSet}
                onChange={(val) =>
                  onUpdate({
                    set: val,
                  })
                }
              />
            )
          ) : (
            badges
          )}
        </div>
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-3 relative h-full">
        <div className="flex items-baseline gap-3 pb-2 border-b border-border/40 min-h-14 pr-8 shrink-0">
          {idValue !== undefined && (
            <div className="shrink-0 self-center">
              <span
                onClick={
                  isReadOnly
                    ? undefined
                    : () => editingField !== "id" && startEdit("id", idValue)
                }
                className={cn(
                  "text-muted-foreground/40 font-mono text-sm font-medium transition-colors select-none",
                  isReadOnly
                    ? "cursor-default"
                    : "hover:text-primary cursor-pointer",
                )}
              >
                #
                {editingField === "id" ? (
                  <input
                    ref={inputRef as React.RefObject<HTMLInputElement>}
                    type="text"
                    value={tempValue}
                    onChange={(e) => setTempValue(e.target.value)}
                    onBlur={saveEdit}
                    onKeyDown={handleKeyDown}
                    className="w-12 text-center font-mono text-sm text-muted-foreground/40 font-medium bg-transparent border-none p-0 outline-none focus:outline-none inline-block"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  idValue
                )}
              </span>
            </div>
          )}

          <div className="flex-1 min-w-0">
            {editingField === "name" ? (
              <input
                ref={inputRef as React.RefObject<HTMLInputElement>}
                type="text"
                value={tempValue}
                onChange={(e) => setTempValue(e.target.value)}
                onBlur={saveEdit}
                onKeyDown={handleKeyDown}
                className="text-3xl font-bold tracking-tight text-foreground bg-transparent border-none p-0 outline-none focus:outline-none w-full"
              />
            ) : (
              <h3
                className={cn(
                  "text-3xl font-bold tracking-tight text-foreground truncate transition-opacity select-none",
                  isReadOnly
                    ? "cursor-default"
                    : "cursor-pointer hover:opacity-70",
                )}
                onClick={isReadOnly ? undefined : () => startEdit("name", name)}
                title={name}
              >
                {name}
              </h3>
            )}
          </div>
        </div>

        <div className="flex-1 relative overflow-hidden">
          {editingField === "desc" ? (
            <textarea
              ref={inputRef as React.RefObject<HTMLTextAreaElement>}
              value={tempValue}
              onChange={(e) => setTempValue(e.target.value)}
              onBlur={saveEdit}
              onKeyDown={handleKeyDown}
              className="w-full h-full text-[13px] resize-none font-medium leading-relaxed text-muted-foreground bg-transparent border-none p-0 outline-none focus:outline-none"
            />
          ) : (
            <div
              className={cn(
                "w-full h-full text-[13px] leading-relaxed text-muted-foreground transition-colors wrap-break-word whitespace-pre-wrap overflow-y-auto pr-2",
                isReadOnly
                  ? "cursor-default"
                  : "cursor-pointer hover:text-foreground",
              )}
              onClick={
                isReadOnly ? undefined : () => startEdit("desc", description)
              }
              dangerouslySetInnerHTML={{
                __html: description || "No description provided...",
              }}
            />
          )}
        </div>

        <div className="mt-auto shrink-0 flex flex-col gap-4">
          {properties.length > 0 && (
            <div className="flex flex-wrap justify-between gap-2 pt-4 border-t border-border/40">
              {properties.map((prop) => (
                <Tooltip
                  key={prop.id}
                  open={!!tooltipStates[prop.id]} // FIXED: Forced boolean
                  onOpenChange={(open) =>
                    setTooltipStates((prev) => ({ ...prev, [prop.id]: open }))
                  }
                >
                  <TooltipTrigger asChild>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isReadOnly) return;
                        prop.onClick();
                        setTooltipStates((prev) => ({
                          ...prev,
                          [prop.id]: true,
                        }));
                      }}
                      onPointerDown={(e) => e.preventDefault()}
                      onMouseEnter={() =>
                        setTooltipStates((prev) => ({
                          ...prev,
                          [prop.id]: true,
                        }))
                      }
                      onMouseLeave={() =>
                        setTooltipStates((prev) => ({
                          ...prev,
                          [prop.id]: false,
                        }))
                      }
                      disabled={isReadOnly}
                      aria-disabled={isReadOnly}
                      className={cn(
                        getPropertyStyles(prop.isActive, prop.variant),
                        isReadOnly && "cursor-default opacity-70",
                      )}
                    >
                      {prop.icon}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="font-bold">{prop.label}</p>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-2">
            {duplicateAction && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onDuplicate) {
                        onDuplicate();
                      } else {
                        duplicateAction.onClick();
                      }
                    }}
                    onPointerDown={(e) => e.preventDefault()}
                    className="h-9 w-9 transition-all hover:scale-110 rounded-lg cursor-pointer"
                  >
                    {duplicateAction.icon}
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="font-bold">
                  {duplicateAction.label}
                </TooltipContent>
              </Tooltip>
            )}

            <div className="flex gap-2">
              {showPlaceholderPickerButton &&
                onOpenPlaceholderPicker &&
                !isReadOnly && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenPlaceholderPicker();
                        }}
                        onPointerDown={(e) => e.preventDefault()}
                        className="h-9 w-9 transition-all hover:scale-110 rounded-lg cursor-pointer"
                      >
                        <Image className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className="font-bold">
                      Choose Placeholder
                    </TooltipContent>
                  </Tooltip>
                )}

              {leadingIconActions.map((action) => (
                <Tooltip key={action.id}>
                  <TooltipTrigger asChild>
                    <Button
                      variant={action.variant || "ghost"}
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        action.onClick();
                      }}
                      onPointerDown={(e) => e.preventDefault()}
                      className={cn(
                        "h-9 w-9 transition-all hover:scale-110 rounded-lg cursor-pointer",
                      )}
                    >
                      {action.icon}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="font-bold">
                    {action.label}
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>

            {(rightAlignedIconActions.length > 0 || textActions.length > 0) && (
              <div className="ml-auto flex items-center gap-2">
                {rightAlignedIconActions.map((action) => (
                  <Tooltip key={action.id}>
                    <TooltipTrigger asChild>
                      <Button
                        variant={action.variant || "ghost"}
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          action.onClick();
                        }}
                        onPointerDown={(e) => e.preventDefault()}
                        className={cn(
                          "h-9 w-9 transition-all hover:scale-110 rounded-lg cursor-pointer",
                        )}
                      >
                        {action.icon}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className="font-bold">
                      {action.label}
                    </TooltipContent>
                  </Tooltip>
                ))}
                {textActions.map((action) => (
                  <Button
                    key={action.id}
                    variant={action.variant || "secondary"}
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      action.onClick();
                    }}
                    onPointerDown={(e) => e.preventDefault()}
                    className="relative h-9 px-3 rounded-lg text-xs font-semibold uppercase tracking-wide cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <span className="flex h-4 w-4 items-center justify-center">
                        {action.icon}
                      </span>
                      {action.id === "edit" ? "Edit" : "Rules"}
                    </span>
                    {typeof action.badgeCount === "number" && (
                      <span className="absolute -top-2 -right-2 h-5 min-w-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold leading-5 shadow-sm">
                        {action.badgeCount}
                      </span>
                    )}
                  </Button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
