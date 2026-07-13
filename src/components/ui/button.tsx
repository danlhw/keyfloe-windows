import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | "primary"
    | "primary-soft"
    | "gold"
    | "secondary"
    | "danger"
    | "danger-ghost"
    | "ghost";
  size?: "sm" | "md" | "lg";
}

export const Button: React.FC<ButtonProps> = ({
  children,
  className = "",
  variant = "primary",
  size = "md",
  ...props
}) => {
  const baseClasses =
    "font-medium rounded-lg border focus:outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer";

  // Keyfloe brand palette (kf- tokens): primary = deep-ink #0b0b0d with
  // warm-paper text (matches the Mac ink-primary + kf-btn-primary); gold =
  // #d69646 with DARK text #1a1207 (kf-btn-gold — gold never carries white).
  // Palette values are inlined so this button matches the brand even inside
  // Handy dialogs that don't load keyfloe.css.
  const variantClasses = {
    primary:
      "text-[#f5f1ea] bg-[#0b0b0d] border-[#0b0b0d] hover:bg-[#0b0b0d]/85 hover:border-[#0b0b0d]/85 focus:ring-1 focus:ring-[#0b0b0d]",
    "primary-soft":
      "text-[#1a1207] bg-[#d69646]/20 border-transparent hover:bg-[#d69646]/30 focus:ring-1 focus:ring-[#d69646]",
    gold:
      "text-[#1a1207] bg-[#d69646] border-[#d69646] hover:bg-[#d69646]/90 hover:border-[#d69646]/90 focus:ring-1 focus:ring-[#d69646]",
    secondary:
      "bg-mid-gray/10 border-mid-gray/20 hover:bg-[#0b0b0d]/10 hover:border-[#d69646] focus:outline-none",
    danger:
      "text-white bg-[#e5484d] border-[#e5484d] hover:bg-[#e5484d]/90 hover:border-[#e5484d]/90 focus:ring-1 focus:ring-[#e5484d]",
    "danger-ghost":
      "text-[#e5484d] border-transparent hover:text-[#e5484d]/80 hover:bg-[#e5484d]/10 focus:bg-[#e5484d]/20",
    ghost:
      "text-current border-transparent hover:bg-mid-gray/10 hover:border-[#d69646] focus:bg-mid-gray/20",
  };

  const sizeClasses = {
    sm: "px-2 py-1 text-xs",
    md: "px-4 py-[5px] text-sm",
    lg: "px-4 py-2 text-base",
  };

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
