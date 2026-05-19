import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[rgba(255,255,255,0.04)] px-4 py-[13px] text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] placeholder:font-light outline-none transition-all hover:border-[var(--border-hover)] hover:bg-[rgba(255,255,255,0.055)] focus:border-[var(--border-active)] focus:bg-[rgba(255,255,255,0.06)] focus:shadow-[0_0_0_4px_rgba(194,57,110,0.08)] disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
