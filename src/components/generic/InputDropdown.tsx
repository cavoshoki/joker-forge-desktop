import React from "react";
import { cn } from "@/lib/utils";

export interface InputDropdownOption {
  value: string | number;
  label: string;
  [key: string]: unknown;
}

interface InputDropdownProps {
  label?: string;
  labelPosition?: "left" | "center" | "right";
  value?: string | number;
  onChange?: (option: InputDropdownOption) => void;
  options: InputDropdownOption[];
  placeholder?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}

const InputDropdown: React.FC<InputDropdownProps> = ({
  label,
  labelPosition = "left",
  value,
  onChange,
  options,
  placeholder,
  className,
  size = "md",
}) => {
  const valueString =
    value === undefined || value === null ? "" : String(value);

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
      <select
        value={valueString}
        onChange={(e) => {
          const selected = options.find(
            (opt) => String(opt.value) === e.target.value,
          ) ?? {
            value: e.target.value,
            label: e.target.value,
          };
          onChange?.(selected);
        }}
        className={cn(
          "w-full rounded-md border border-zinc-700 bg-zinc-900 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-jungle-green-400/40",
          size === "sm" && "h-8 px-2 text-sm",
          size === "md" && "h-10 px-3 text-sm",
          size === "lg" && "h-11 px-4 text-base",
          className,
        )}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option
            key={`${String(option.value)}-${option.label}`}
            value={String(option.value)}
          >
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
};

export default InputDropdown;
