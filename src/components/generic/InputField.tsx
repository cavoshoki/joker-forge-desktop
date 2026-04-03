import React from "react";
import { cn } from "@/lib/utils";

interface InputFieldProps {
  label?: string;
  labelPosition?: "left" | "center" | "right";
  value?: string | number;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  error?: string;
}

const InputField: React.FC<InputFieldProps> = ({
  label,
  labelPosition = "left",
  value,
  onChange,
  placeholder,
  type = "text",
  size = "md",
  className,
  error,
}) => {
  const resolvedType = type === "string" ? "text" : type;

  return (
    <div className="space-y-1">
      {label && (
        <label
          className={cn(
            "block text-zinc-200 text-sm",
            labelPosition === "center" && "text-center",
            labelPosition === "right" && "text-right",
          )}
        >
          {label}
        </label>
      )}
      <input
        type={resolvedType}
        value={value ?? ""}
        onChange={onChange}
        placeholder={placeholder}
        className={cn(
          "w-full rounded-md border border-zinc-700 bg-zinc-900 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-jungle-green-400/40",
          size === "sm" && "h-8 px-2 text-sm",
          size === "md" && "h-10 px-3 text-sm",
          size === "lg" && "h-11 px-4 text-base",
          error && "border-balatro-red focus:ring-balatro-red/40",
          className,
        )}
      />
    </div>
  );
};

export default InputField;
