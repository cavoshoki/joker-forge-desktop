import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getAllConsumableSets } from "@/lib/balatro-utils";
import { cn } from "@/lib/utils";

interface ConsumableSetSelectProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

const VANILLA_SET_COLORS: Record<string, string> = {
  Tarot: "#b26cbb",
  Planet: "#13afce",
  Spectral: "#4584fa",
};

function normalizeHex(value: string | undefined): string | null {
  if (!value) return null;
  const clean = value.replace("#", "").replace(/[^0-9a-fA-F]/g, "");
  if (!clean) return null;
  const normalized = clean.slice(0, 6).padEnd(6, "0");
  return `#${normalized}`;
}

function getSetColor(
  setOption: ReturnType<typeof getAllConsumableSets>[number] | undefined,
): string {
  if (!setOption) return "#666666";
  if (setOption.isCustom) {
    return normalizeHex(setOption.customData.primary_colour) || "#666666";
  }
  return VANILLA_SET_COLORS[setOption.value] || "#666666";
}

export function ConsumableSetSelect({
  value,
  onChange,
  className,
}: ConsumableSetSelectProps) {
  const sets = getAllConsumableSets();
  const currentSet = sets.find((set) => set.value === value);
  const currentColor = getSetColor(currentSet);

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        className={cn(
          "h-8 font-bold uppercase tracking-wider border-2 cursor-pointer transition-colors focus:ring-0 focus:ring-offset-0 bg-popover!",
          className,
        )}
        style={{
          borderColor: currentColor,
          color: currentColor,
          backgroundColor: `${currentColor}20`,
        }}
      >
        <SelectValue placeholder="Select Set" />
      </SelectTrigger>
      <SelectContent className="border-none bg-popover p-2 shadow-xl">
        {sets.map((setOption) => {
          const color = getSetColor(setOption);
          return (
            <SelectItem
              key={setOption.key}
              value={setOption.value}
              className="font-bold uppercase tracking-wider cursor-pointer my-2 border-2 transition-all hover:scale-105 focus:scale-105 focus:bg-transparent"
              style={{
                borderColor: color,
                color,
                backgroundColor: `${color}20`,
              }}
            >
              {setOption.label}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
