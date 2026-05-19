import { useState, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, Calendar, X } from "lucide-react";

const DAYS_PT = ["D", "S", "T", "Q", "Q", "S", "S"];
const MONTHS_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

interface DatePickerProps {
  value: string | null;        // "YYYY-MM-DD" or null
  onChange: (val: string | null) => void;
  placeholder?: string;
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

export default function DatePicker({ value, onChange, placeholder = "Selecionar data" }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const today = new Date();
  const parsed = value ? new Date(value + "T00:00:00") : null;
  const [viewYear, setViewYear] = useState(parsed?.getFullYear() ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed?.getMonth() ?? today.getMonth());

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Sync view when value changes externally
  useEffect(() => {
    if (parsed) {
      setViewYear(parsed.getFullYear());
      setViewMonth(parsed.getMonth());
    }
  }, [value]);

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfWeek(viewYear, viewMonth);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const selectDay = (day: number) => {
    const mm = String(viewMonth + 1).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    onChange(`${viewYear}-${mm}-${dd}`);
    setOpen(false);
  };

  const isSelected = (day: number) => {
    if (!parsed) return false;
    return parsed.getFullYear() === viewYear && parsed.getMonth() === viewMonth && parsed.getDate() === day;
  };

  const isToday = (day: number) => {
    return today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === day;
  };

  const displayValue = parsed
    ? `${String(parsed.getDate()).padStart(2, "0")}/${String(parsed.getMonth() + 1).padStart(2, "0")}/${parsed.getFullYear()}`
    : null;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Trigger button */}
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
          padding: "0 12px",
          color: displayValue ? "var(--text-1)" : "var(--text-3)",
          fontSize: 13,
          fontFamily: "var(--font-body)",
          cursor: "pointer",
          transition: "border-color 0.15s",
          minWidth: 140,
          whiteSpace: "nowrap",
        }}
      >
        <Calendar size={14} style={{ color: "var(--text-3)", flexShrink: 0 }} />
        <span>{displayValue ?? placeholder}</span>
        {value && (
          <X
            size={12}
            style={{ color: "var(--text-3)", marginLeft: "auto", flexShrink: 0 }}
            onClick={e => { e.stopPropagation(); onChange(null); }}
          />
        )}
      </button>

      {/* Dropdown calendar */}
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
            padding: 16,
            width: 280,
            boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
          }}
        >
          {/* Month/year nav */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <button type="button" onClick={prevMonth} style={navBtnStyle}>
              <ChevronLeft size={16} />
            </button>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)", fontFamily: "var(--font-body)" }}>
              {MONTHS_PT[viewMonth]} {viewYear}
            </span>
            <button type="button" onClick={nextMonth} style={navBtnStyle}>
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Day-of-week header */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
            {DAYS_PT.map((d, i) => (
              <div key={i} style={{ textAlign: "center", fontSize: 11, fontWeight: 600, color: "var(--text-3)", padding: "4px 0" }}>
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
            {/* Empty cells before first day */}
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} style={{ width: 34, height: 34 }} />
            ))}
            {/* Day buttons */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const selected = isSelected(day);
              const todayMark = isToday(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => selectDay(day)}
                  style={{
                    width: 34,
                    height: 34,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 13,
                    fontFamily: "var(--font-body)",
                    fontWeight: selected ? 700 : 400,
                    color: selected ? "#fff" : todayMark ? "var(--accent)" : "var(--text-1)",
                    background: selected ? "var(--cr-grad)" : "transparent",
                    border: todayMark && !selected ? "1px solid var(--accent)" : "1px solid transparent",
                    borderRadius: "var(--radius-sm)",
                    cursor: "pointer",
                    transition: "all 0.12s",
                  }}
                  onMouseEnter={e => {
                    if (!selected) {
                      (e.target as HTMLElement).style.background = "var(--surface-hover)";
                    }
                  }}
                  onMouseLeave={e => {
                    if (!selected) {
                      (e.target as HTMLElement).style.background = "transparent";
                    }
                  }}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
            <button
              type="button"
              onClick={() => { onChange(null); setOpen(false); }}
              style={{ fontSize: 12, color: "var(--text-3)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-body)", padding: "4px 8px", borderRadius: "var(--radius-sm)" }}
              onMouseEnter={e => { (e.target as HTMLElement).style.color = "var(--text-1)"; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.color = "var(--text-3)"; }}
            >
              Limpar
            </button>
            <button
              type="button"
              onClick={() => {
                const t = new Date();
                const mm = String(t.getMonth() + 1).padStart(2, "0");
                const dd = String(t.getDate()).padStart(2, "0");
                onChange(`${t.getFullYear()}-${mm}-${dd}`);
                setOpen(false);
              }}
              style={{ fontSize: 12, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-body)", fontWeight: 600, padding: "4px 8px", borderRadius: "var(--radius-sm)" }}
              onMouseEnter={e => { (e.target as HTMLElement).style.background = "var(--surface)"; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.background = "none"; }}
            >
              Hoje
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const navBtnStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  color: "var(--text-2)",
  width: 28,
  height: 28,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  transition: "all 0.12s",
};
