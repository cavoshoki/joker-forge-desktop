import * as React from "react";

import { cn } from "@/lib/utils";

type InputSize = "sm" | "md" | "lg";

type InputProps = Omit<React.ComponentProps<"input">, "size"> & {
  label?: string;
  labelPosition?: "left" | "center" | "right";
  size?: InputSize | number;
  error?: string;
};

function Input({
  className,
  type,
  label,
  labelPosition = "left",
  size,
  error,
  ...props
}: InputProps) {
  const sizeClasses =
    size === "sm"
      ? "h-8 px-2 text-sm"
      : size === "lg"
        ? "h-11 px-4 text-base"
        : size === "md"
          ? "h-10 px-3 text-sm"
          : "";

  const inputNode = (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        sizeClasses,
        error && "border-balatro-red focus:ring-balatro-red/40",
        className,
      )}
      {...props}
    />
  );

  if (!label) {
    return inputNode;
  }

  return (
    <div className="space-y-1">
      <label
        className={cn(
          "block text-zinc-200 text-sm",
          labelPosition === "center" && "text-center",
          labelPosition === "right" && "text-right",
        )}
      >
        {label}
      </label>
      {inputNode}
    </div>
  );
}

export { Input };
