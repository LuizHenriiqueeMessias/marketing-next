import { FileText, Target, Sparkles, MessageSquare, Zap } from "lucide-react";

interface Section {
  icon: React.ElementType;
  label: string;
  color: string;
  bgColor: string;
  content: string;
}

function parseReadaptacao(md: string | null): Section[] {
  if (!md) return [];

  const sections: Section[] = [];
  const text = md.trim();

  // Split by section markers
  const refMatch = text.match(/📌\s*REFERÊNCIA[:\s]*([\s\S]*?)(?=---|\n🎯|\n🪝|\n📝|\n📲|$)/i);
  const formatoMatch = text.match(/🎯\s*FORMATO SUGERIDO[:\s]*([\s\S]*?)(?=---|\n🪝|\n📝|\n📲|$)/i);
  const hookMatch = text.match(/🪝\s*HOOK[^:]*[:\s]*([\s\S]*?)(?=---|\n📝|\n📲|$)/i);
  const roteiroMatch = text.match(/📝\s*ROTEIRO\s*\/?\s*CORPO[:\s]*([\s\S]*?)(?=---|\n📲|$)/i);
  const legendaMatch = text.match(/📲\s*LEGENDA\s*\+?\s*CTA[:\s]*([\s\S]*?)$/i);

  if (refMatch?.[1]?.trim()) {
    sections.push({
      icon: FileText,
      label: "Referência",
      color: "#a78bfa",
      bgColor: "rgba(167,139,250,0.1)",
      content: refMatch[1].trim().replace(/^---\s*/gm, ""),
    });
  }

  if (formatoMatch?.[1]?.trim()) {
    sections.push({
      icon: Target,
      label: "Formato sugerido",
      color: "#f472b6",
      bgColor: "rgba(244,114,182,0.1)",
      content: formatoMatch[1].trim().replace(/^---\s*/gm, ""),
    });
  }

  if (hookMatch?.[1]?.trim()) {
    sections.push({
      icon: Zap,
      label: "Hook",
      color: "#fbbf24",
      bgColor: "rgba(251,191,36,0.1)",
      content: hookMatch[1].trim().replace(/^---\s*/gm, ""),
    });
  }

  if (roteiroMatch?.[1]?.trim()) {
    sections.push({
      icon: Sparkles,
      label: "Roteiro / Corpo",
      color: "#34d399",
      bgColor: "rgba(52,211,153,0.1)",
      content: roteiroMatch[1].trim().replace(/^---\s*/gm, ""),
    });
  }

  if (legendaMatch?.[1]?.trim()) {
    sections.push({
      icon: MessageSquare,
      label: "Legenda + CTA",
      color: "#60a5fa",
      bgColor: "rgba(96,165,250,0.1)",
      content: legendaMatch[1].trim().replace(/^---\s*/gm, ""),
    });
  }

  // Fallback: if no sections parsed, show raw
  if (sections.length === 0 && text) {
    sections.push({
      icon: FileText,
      label: "Readaptação",
      color: "#a78bfa",
      bgColor: "rgba(167,139,250,0.1)",
      content: text,
    });
  }

  return sections;
}

export default function ReadaptacaoCard({ text }: { text: string | null }) {
  const sections = parseReadaptacao(text);

  if (sections.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", color: "var(--text-3)", marginBottom: 2 }}>
        Conteúdo readaptado
      </div>
      {sections.map((section, i) => {
        const Icon = section.icon;
        return (
          <div
            key={i}
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: 12,
              transition: "border-color 0.15s",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  background: section.bgColor,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon size={11} style={{ color: section.color }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: section.color }}>
                {section.label}
              </span>
            </div>
            <div
              style={{
                fontSize: 12.5,
                color: "var(--text-2)",
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {section.content}
            </div>
          </div>
        );
      })}
    </div>
  );
}
