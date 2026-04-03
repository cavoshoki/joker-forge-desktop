import React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary";
type Size = "sm" | "md" | "lg";

interface ButtonProps {
  variant?: Variant;
  size?: Size;
  onClick?: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
  type?: "button" | "submit" | "reset";
}

const sizeClasses: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-base",
};

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-jungle-green-500 text-black hover:bg-jungle-green-400 disabled:bg-zinc-700 disabled:text-zinc-400",
  secondary:
    "bg-zinc-800 text-zinc-100 border border-zinc-700 hover:bg-zinc-700 disabled:bg-zinc-900 disabled:text-zinc-500",
};

const Button: React.FC<ButtonProps> = ({
  variant = "primary",
  size = "md",
  onClick,
  disabled,
  fullWidth,
  icon,
  className,
  children,
  type = "button",
}) => {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors cursor-pointer",
        sizeClasses[size],
        variantClasses[variant],
        fullWidth && "w-full",
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
};

export default Button;
