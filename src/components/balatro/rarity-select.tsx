import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getAllRarities, getRarityBadgeColor } from "@/lib/balatro-utils";
import { cn } from "@/lib/utils";

interface RaritySelectProps {
  value: string | number;
  onChange: (value: string) => void;
  className?: string;
}

const SOFT_LIGHT_SURFACE = "#f5f7fb";

function isDarkHexColor(hex: string): boolean {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return false;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if ([r, g, b].some((v) => Number.isNaN(v))) return false;
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance < 0.38;
}

export function RaritySelect({
  value,
  onChange,
  className,
}: RaritySelectProps) {
  const rarities = getAllRarities();
  const currentRarity = rarities.find(
    (r) => r.value.toString() === value.toString(),
  );

  const currentColor = currentRarity
    ? getRarityBadgeColor(currentRarity.value)
    : "#009dff";
  const currentIsDark = isDarkHexColor(currentColor);
  const currentSurface = currentIsDark
    ? SOFT_LIGHT_SURFACE
    : `${currentColor}20`;
  const triggerShadow = currentIsDark
    ? "inset 0 0 0 1px rgba(255,255,255,0.85), 0 1px 2px rgba(15,23,42,0.08)"
    : undefined;

  return (
    <Select value={value.toString()} onValueChange={onChange}>
      <SelectTrigger
        className={cn(
          "h-8 font-bold uppercase tracking-wider border-2 cursor-pointer transition-colors focus:ring-0 focus:ring-offset-0 bg-popover!",
          className,
        )}
        style={{
          borderColor: currentColor,
          color: currentColor,
          backgroundColor: currentSurface,
          boxShadow: triggerShadow,
        }}
      >
        <SelectValue
          placeholder="Select Rarity"
          style={{
            color: currentColor,
            backgroundColor: currentSurface,
            borderRadius: 6,
            paddingInline: 2,
          }}
        />
      </SelectTrigger>
      <SelectContent className="border-none bg-popover p-2 shadow-xl">
        {rarities.map((rarity) => {
          const color = getRarityBadgeColor(rarity.value);
          const isDark = isDarkHexColor(color);
          const surface = isDark ? SOFT_LIGHT_SURFACE : `${color}20`;
          return (
            <SelectItem
              key={rarity.key}
              value={rarity.value.toString()}
              className="font-bold uppercase tracking-wider cursor-pointer my-2 border-2 transition-all hover:scale-105 focus:scale-105 focus:bg-transparent"
              style={{
                borderColor: color,
                color: color,
                backgroundColor: surface,
              }}
            >
              {rarity.label}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
