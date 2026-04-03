import React from "react";

interface CheckboxProps {
  id: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
}

const Checkbox: React.FC<CheckboxProps> = ({
  id,
  label,
  checked,
  disabled,
  onChange,
}) => {
  return (
    <label
      htmlFor={id}
      className="flex items-center gap-2 cursor-pointer select-none"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
        className="h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-jungle-green-400"
      />
      <span className="text-sm text-zinc-100">{label}</span>
    </label>
  );
};

export default Checkbox;
