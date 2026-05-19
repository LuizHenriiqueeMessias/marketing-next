import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "video" | "carousel" | "image";
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  const variants: Record<string, string> = {
    default: "border-transparent bg-[var(--surface)] text-[var(--text-1)]",
    secondary: "border-transparent bg-[var(--surface-2)] text-[var(--text-2)]",
    destructive: "border-transparent bg-[rgba(239,68,68,0.1)] text-[#ef4444]",
    outline: "text-[var(--text-2)]",
    video: "badge badge-video",
    carousel: "badge badge-carousel",
    image: "badge badge-image",
  };
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-[4px] border px-[7px] py-[3px] text-[12px] font-medium transition-colors focus:outline-none whitespace-nowrap",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}

export { Badge };
