import React from "react";
import { Badge } from "@/components/ui/badge";

interface ItemTypeBadgeProps {
  itemType: "joker" | "consumable" | "card" | "voucher" | "deck";
  className?: string;
}

const ItemTypeBadge: React.FC<ItemTypeBadgeProps> = ({
  itemType,
  className,
}) => {
  return (
    <Badge
      variant="outline"
      className={`h-5 px-2 text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/80 border-border bg-card/80 ${className ?? ""}`}
    >
      {itemType}
    </Badge>
  );
};

export default ItemTypeBadge;
