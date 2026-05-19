import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[90px] w-full rounded-[var(--radius)] border border-[var(--border)] bg-[rgba(255,255,255,0.04)] px-[14px] py-3 text-sm text-[var(--text-1)] leading-[1.6] placeholder:text-[var(--text-3)] outline-none transition-colors focus:border-[var(--border-active)] disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
