import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "primary" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    const baseStyles =
      "inline-flex items-center justify-center whitespace-nowrap rounded-[var(--radius-sm)] text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,93,143,0.14)] disabled:pointer-events-none disabled:opacity-50";
    const variantStyles: Record<string, string> = {
      default:
        "bg-[var(--surface)] text-[var(--text-1)] border border-[var(--border)] hover:bg-[var(--surface-hover)] hover:border-[var(--border-hover)]",
      primary: "btn-primary",
      destructive: "bg-[#ef4444] text-white hover:opacity-90",
      outline:
        "border border-[var(--border)] bg-transparent text-[var(--text-2)] hover:bg-[var(--surface-hover)] hover:border-[var(--border-hover)] hover:text-[var(--text-1)]",
      secondary:
        "bg-[var(--surface)] text-[var(--text-1)] hover:bg-[var(--surface-hover)]",
      ghost:
        "text-[var(--text-2)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-1)]",
      link: "text-[var(--text-1)] underline-offset-4 hover:underline",
    };
    const sizeStyles: Record<string, string> = {
      default: "h-9 px-4 py-2",
      sm: "h-8 rounded-[var(--radius-sm)] px-3 text-xs",
      lg: "h-10 rounded-[var(--radius)] px-8",
      icon: "h-9 w-9",
    };
    return (
      <Comp
        className={cn(baseStyles, variantStyles[variant], sizeStyles[size], className)}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
