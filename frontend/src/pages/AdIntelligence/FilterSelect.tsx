import { useState, useRef, useEffect } from "react";
import { ChevronDown, X, Check } from "lucide-react";

export interface FilterOption {
  value: string;
  label: string;
}

interface FilterSelectProps {
  value: string | null;
  onChange: (val: string | null) => void;
  options: FilterOption[];
  placeholder: string;
  icon?: React.ReactNode;
}

export default function FilterSelect({ value, onChange, options, placeholder, icon }: FilterSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const selectedLabel = options.find(o => o.value === value)?.label ?? null;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          height: 40,
          background: "var(--surface)",
          border: open ? "1px solid var(--border-active)" : "1px solid var(--border)",
          borderRadius: "var(--radius-sm)",
          padding: "0 10px 0 12px",
          color: selectedLabel ? "var(--text-1)" : "var(--text-3)",
          fontSize: 13,
          fontFamily: "var(--font-body)",
          cursor: "pointer",
          transition: "border-color 0.15s",
          whiteSpace: "nowrap",
          minWidth: 0,
        }}
      >
        {icon && <span style={{ display: "flex", flexShrink: 0, color: "var(--text-3)" }}>{icon}</span>}
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
          {selectedLabel ?? placeholder}
        </span>
        {value ? (
          <X
            size={12}
            style={{ color: "var(--text-3)", marginLeft: "auto", flexShrink: 0 }}
            onClick={e => { e.stopPropagation(); onChange(null); setOpen(false); }}
          />
        ) : (
          <ChevronDown
            size={14}
            style={{
              color: "var(--text-3)",
              marginLeft: "auto",
              flexShrink: 0,
              transform: open ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.15s",
            }}
          />
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            zIndex: 100,
            background: "var(--dialog-bg, #141418)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: "6px 0",
            minWidth: "100%",
            width: "max-content",
            maxHeight: 260,
            overflowY: "auto",
            boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
          }}
        >
          {/* "All" / reset option */}
          <button
            type="button"
            onClick={() => { onChange(null); setOpen(false); }}
            style={{
              ...optionStyle,
              color: !value ? "var(--accent)" : "var(--text-2)",
              fontWeight: !value ? 600 : 400,
            }}
            onMouseEnter={e => { (e.target as HTMLElement).style.background = "var(--surface-hover)"; }}
            onMouseLeave={e => { (e.target as HTMLElement).style.background = "transparent"; }}
          >
            <span style={{ flex: 1 }}>{placeholder}</span>
            {!value && <Check size={14} style={{ color: "var(--accent)", flexShrink: 0 }} />}
          </button>

          {/* Options */}
          {options.map(opt => {
            const active = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                style={{
                  ...optionStyle,
                  color: active ? "var(--text-1)" : "var(--text-2)",
                  fontWeight: active ? 600 : 400,
                  background: active ? "var(--surface)" : "transparent",
                }}
                onMouseEnter={e => { (e.target as HTMLElement).style.background = "var(--surface-hover)"; }}
                onMouseLeave={e => { (e.target as HTMLElement).style.background = active ? "var(--surface)" : "transparent"; }}
              >
                <span style={{ flex: 1 }}>{opt.label}</span>
                {active && <Check size={14} style={{ color: "var(--accent)", flexShrink: 0 }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const optionStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  padding: "8px 14px",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  fontSize: 13,
  fontFamily: "var(--font-body)",
  textAlign: "left",
  transition: "background 0.1s",
};
