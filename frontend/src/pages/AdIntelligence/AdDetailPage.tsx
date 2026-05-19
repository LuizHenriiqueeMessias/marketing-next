import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import {
  ChevronLeft,
  Sparkles,
  TrendingUp,
  FileText,
  Hash,
  Lightbulb,
  ExternalLink,
  Image,
  Video,
  Loader2,
  FileDown,
} from "lucide-react";
import jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import type { AdCreativeWithRelations } from "./types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function supabaseStorageUrl(path: string): string {
  return `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/ad-media/${path}`;
}

function getMediaBadgeInfo(type: string | null): { className: string; label: string } {
  const t = (type || "").toLowerCase();
  if (t.includes("video")) return { className: "badge badge-video", label: "Video" };
  if (t.includes("carousel")) return { className: "badge badge-carousel", label: "Carrossel" };
  return { className: "badge badge-image", label: "Imagem" };
}

// ─── ScoreBar ─────────────────────────────────────────────────────────────────

function ScoreBar({ score }: { score: number | null }) {
  if (score == null)
    return <span style={{ color: "var(--text-3)", fontSize: 12 }}>--</span>;
  const level = score >= 8 ? "high" : score >= 6 ? "mid" : "low";
  const filled = Math.round(score / 2);
  return (
    <div className="score-bar">
      <div className="score-dots">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className={`score-dot ${i < filled ? `filled-${level}` : "empty"}`} />
        ))}
      </div>
      <span className={`score-num ${level}`}>{score}</span>
    </div>
  );
}

// ─── AnalysisCard ─────────────────────────────────────────────────────────────

function AnalysisCard({
  icon: Icon,
  title,
  gradient,
  children,
}: {
  icon: React.ElementType;
  title: string;
  gradient: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: 16,
        marginBottom: 12,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Gradient accent line at top */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background: gradient,
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, position: "relative" }}>
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 6,
            background: gradient,
            opacity: 0.12,
            position: "absolute",
            left: 0,
            top: "50%",
            transform: "translateY(-50%)",
          }}
        />
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
          }}
        >
          <Icon size={14} style={{ color: "var(--text-1)" }} />
        </div>
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            backgroundImage: gradient,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            letterSpacing: "0.02em",
          }}
        >
          {title}
        </span>
      </div>
      <div style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

// ─── PDF Export ──────────────────────────────────────────────────────────────

async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s+/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/^[-*]\s+/gm, "  - ")
    .replace(/^\d+\.\s+/gm, (m) => `  ${m}`)
    .trim();
}

async function generateAdBriefingPdf(ad: AdCreativeWithRelations) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginL = 20;
  const marginR = 20;
  const contentW = pageW - marginL - marginR;
  let y = 20;

  const analysis = ad.ad_analyses;
  const competitorName = ad.ad_competitors?.name ?? "Desconhecido";

  // Colors
  const dark = [30, 30, 35] as const;
  const accent = [99, 102, 241] as const;
  const textPrimary = [240, 240, 245] as const;
  const textSecondary = [180, 180, 190] as const;
  const surfaceBg = [40, 40, 48] as const;

  // Background
  doc.setFillColor(...dark);
  doc.rect(0, 0, pageW, pageH, "F");

  // Helper: check page break
  const ensureSpace = (needed: number) => {
    if (y + needed > pageH - 15) {
      doc.addPage();
      doc.setFillColor(...dark);
      doc.rect(0, 0, pageW, pageH, "F");
      y = 20;
    }
  };

  // Helper: wrapped text, returns new Y
  const writeWrapped = (
    text: string,
    x: number,
    startY: number,
    maxW: number,
    fontSize: number,
    color: readonly [number, number, number],
    fontStyle: string = "normal",
  ): number => {
    doc.setFontSize(fontSize);
    doc.setFont("helvetica", fontStyle);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(text, maxW);
    const lineH = fontSize * 0.45;
    for (const line of lines) {
      ensureSpace(lineH + 2);
      doc.text(line, x, startY);
      startY += lineH;
    }
    return startY;
  };

  // Helper: section title
  const sectionTitle = (title: string) => {
    ensureSpace(14);
    // Accent bar
    doc.setFillColor(...accent);
    doc.rect(marginL, y, 3, 6, "F");
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...textPrimary);
    doc.text(title, marginL + 7, y + 5);
    y += 12;
  };

  // Helper: key-value row
  const kvRow = (key: string, value: string) => {
    ensureSpace(8);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...textSecondary);
    doc.text(`${key}:`, marginL + 4, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...textPrimary);
    const valX = marginL + 4 + doc.getTextWidth(`${key}: `) + 2;
    const remainingW = contentW - (valX - marginL);
    y = writeWrapped(value, valX, y, remainingW, 9, textPrimary);
    y += 2;
  };

  // ── Header ──────────────────────────────────────────────────────────────────
  // Header background
  doc.setFillColor(...accent);
  doc.rect(0, 0, pageW, 32, "F");
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("Briefing de Anuncio", marginL, 16);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(220, 220, 255);
  const headerSub = `${competitorName}  |  ID: ${ad.ad_id ?? "—"}  |  ${new Date().toLocaleDateString("pt-BR")}`;
  doc.text(headerSub, marginL, 24);
  y = 40;

  // ── Thumbnail ───────────────────────────────────────────────────────────────
  const imageUrl = ad.storage_image_path
    ? `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/ad-media/${ad.storage_image_path}`
    : ad.thumbnail_url;

  if (imageUrl) {
    const imgData = await fetchImageAsBase64(imageUrl);
    if (imgData) {
      try {
        const maxImgH = 60;
        const imgW = contentW * 0.6;
        const imgX = marginL + (contentW - imgW) / 2;
        doc.addImage(imgData, "JPEG", imgX, y, imgW, maxImgH);
        y += maxImgH + 8;
      } catch {
        // skip image if unsupported format
      }
    }
  }

  // ── Copy / Descricao ────────────────────────────────────────────────────────
  if (ad.body_text) {
    sectionTitle("Descricao / Copy");
    doc.setFillColor(...surfaceBg);
    const textLines = doc.splitTextToSize(ad.body_text, contentW - 8);
    const blockH = textLines.length * 4.2 + 6;
    ensureSpace(blockH + 4);
    doc.roundedRect(marginL, y - 2, contentW, blockH, 2, 2, "F");
    y = writeWrapped(ad.body_text, marginL + 4, y + 2, contentW - 8, 9, textPrimary);
    y += 6;
  }

  // ── Transcricao ─────────────────────────────────────────────────────────────
  if (ad.transcricao) {
    sectionTitle("Transcricao de Audio");
    y = writeWrapped(ad.transcricao, marginL + 4, y, contentW - 8, 9, textSecondary);
    y += 8;
  }

  // ── Analise ─────────────────────────────────────────────────────────────────
  if (analysis) {
    sectionTitle("Analise");

    if (analysis.score != null) {
      kvRow("Score", `${analysis.score}/10`);
    }
    if (analysis.hook_text) {
      const hookVal = analysis.hook_type
        ? `${analysis.hook_text} (${analysis.hook_type})`
        : analysis.hook_text;
      kvRow("Gancho", hookVal);
    }
    if (analysis.angle_tag) {
      kvRow("Angulo", analysis.angle_tag);
    }
    if (analysis.cta_analysis) {
      kvRow("CTA", analysis.cta_analysis);
    }
    if (analysis.structure_summary) {
      kvRow("Estrutura", analysis.structure_summary);
    }
    if (analysis.insights) {
      ensureSpace(10);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...textSecondary);
      doc.text("Insights:", marginL + 4, y);
      y += 5;
      const cleaned = stripMarkdown(analysis.insights);
      y = writeWrapped(cleaned, marginL + 4, y, contentW - 8, 9, textPrimary);
      y += 6;
    }
  }

  // ── Metadados ───────────────────────────────────────────────────────────────
  sectionTitle("Metadados");
  if (ad.platforms && ad.platforms.length > 0) {
    kvRow("Plataformas", ad.platforms.join(", "));
  }
  if (ad.status) kvRow("Status", ad.status);
  if (ad.start_date) kvRow("Inicio", ad.start_date);
  if (ad.end_date) kvRow("Fim", ad.end_date);
  if (ad.creative_type) kvRow("Tipo", ad.creative_type);
  if (ad.ad_url) kvRow("Link", ad.ad_url);

  // ── Footer ──────────────────────────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120, 120, 130);
    doc.text(
      `Gerado em ${new Date().toLocaleString("pt-BR")}  —  Pagina ${i}/${totalPages}`,
      marginL,
      pageH - 8,
    );
  }

  // Save
  const safeName = competitorName.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
  doc.save(`briefing-${safeName}-${ad.ad_id ?? "unknown"}.pdf`);
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AdDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [ad, setAd] = useState<AdCreativeWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!id) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    const fetchAd = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("ad_creatives")
          .select("*, ad_competitors(*), ad_analyses(*)")
          .eq("id", id)
          .single();

        if (error || !data) {
          setNotFound(true);
        } else {
          setAd(data as AdCreativeWithRelations);
        }
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };

    fetchAd();
  }, [id]);

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
        }}
      >
        <Loader2 size={24} className="animate-spin" style={{ color: "var(--text-3)" }} />
      </div>
    );
  }

  // ── Not found state ────────────────────────────────────────────────────────
  if (notFound || !ad) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          gap: 16,
        }}
      >
        <p style={{ fontSize: 16, color: "var(--text-2)" }}>Anuncio nao encontrado</p>
        <button
          className="icon-btn"
          style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "8px 16px" }}
          onClick={() => navigate(-1)}
        >
          <ChevronLeft size={16} />
          Voltar para Ad Intelligence
        </button>
      </div>
    );
  }

  const analysis = ad.ad_analyses;
  const mediaBadge = getMediaBadgeInfo(ad.creative_type);

  const handleExportPdf = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await generateAdBriefingPdf(ad);
    } catch (err) {
      console.error("PDF export failed:", err);
    } finally {
      setExporting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      {/* Page header */}
      <div
        className="page-header"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <button
          aria-label="Voltar"
          className="icon-btn"
          style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
          onClick={() => navigate(-1)}
        >
          <ChevronLeft size={20} />
        </button>
        <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)", fontFamily: "'Montserrat', sans-serif", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {ad.ad_competitors?.name ?? "\u2014"}
        </span>
        <span className={mediaBadge.className}>{mediaBadge.label}</span>
        {ad.start_date && (
          <span style={{ fontSize: 12, color: "var(--text-3)" }}>
            {new Date(ad.start_date).toLocaleDateString("pt-BR")}
          </span>
        )}
        {ad.status && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: "3px 10px",
              borderRadius: 20,
              background: ad.status === "ativo" ? "rgba(74, 222, 128, 0.15)" : "rgba(239, 68, 68, 0.15)",
              color: ad.status === "ativo" ? "#4ade80" : "#ef4444",
              textTransform: "capitalize",
            }}
          >
            {ad.status}
          </span>
        )}

        {/* PDF button — right side */}
        <button
          onClick={handleExportPdf}
          disabled={exporting}
          title="Exportar PDF"
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            fontWeight: 500,
            padding: "6px 14px",
            whiteSpace: "nowrap",
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            color: "var(--text-2)",
            opacity: exporting ? 0.5 : 1,
            cursor: exporting ? "not-allowed" : "pointer",
          }}
        >
          {exporting ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
          PDF
        </button>
      </div>

      {/* Two-column layout */}
      <div
        style={{
          display: "flex",
          gap: 32,
          flex: 1,
          overflow: "hidden",
          padding: "24px 24px 0",
        }}
      >
        {/* LEFT column — Media + Copy */}
        <div
          style={{
            width: "50%",
            overflowY: "auto",
            paddingBottom: 24,
          }}
        >
          {/* Media */}
          {ad.creative_type?.toLowerCase().includes("video") && (ad.storage_video_path || ad.video_url) ? (
            <video
              controls
              poster={ad.storage_image_path ? supabaseStorageUrl(ad.storage_image_path) : ad.thumbnail_url || undefined}
              style={{ width: "100%", maxHeight: 400, borderRadius: "var(--radius-sm)", display: "block", objectFit: "contain", background: "#000" }}
              src={ad.storage_video_path ? supabaseStorageUrl(ad.storage_video_path) : ad.video_url!}
            />
          ) : (ad.storage_image_path || ad.thumbnail_url) ? (
            <img
              style={{ width: "100%", maxHeight: 400, borderRadius: "var(--radius-sm)", display: "block", objectFit: "contain", background: "#000" }}
              src={ad.storage_image_path ? supabaseStorageUrl(ad.storage_image_path) : ad.thumbnail_url!}
              alt="Ad creative"
            />
          ) : (
            <div
              style={{
                width: "100%",
                height: 200,
                borderRadius: "var(--radius-sm)",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {ad.creative_type?.toLowerCase().includes("video") ? (
                <Video size={24} style={{ color: "var(--text-3)" }} />
              ) : (
                <Image size={24} style={{ color: "var(--text-3)" }} />
              )}
            </div>
          )}

          {/* Body text */}
            <p
              style={{
                fontSize: 13,
                color: ad.body_text ? "var(--text-1)" : "var(--text-3)",
                lineHeight: 1.6,
                marginTop: 0,
                marginBottom: 12,
              }}
            >
              {ad.body_text ?? "\u2014"}
            </p>

            {/* CTA type badge */}
            {ad.cta_type && (
              <div style={{ marginBottom: 12 }}>
                <Badge variant="outline" style={{ fontSize: 12 }}>
                  {ad.cta_type}
                </Badge>
              </div>
            )}

            {/* Original ad link */}
            {ad.ad_url && (
              <div style={{ marginBottom: 16 }}>
                <a
                  href={ad.ad_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 13,
                    color: "var(--accent)",
                    textDecoration: "none",
                  }}
                >
                  <ExternalLink size={14} />
                  Ver anuncio original
                </a>
              </div>
            )}

            {/* Transcription section */}
            {ad.transcricao && (
              <div
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-lg)",
                  padding: 16,
                  marginTop: 8,
                }}
              >
                <span
                  style={{
                    display: "block",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--text-3)",
                    marginBottom: 8,
                  }}
                >
                  Transcricao de audio
                </span>
                <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.6, margin: 0 }}>
                  {ad.transcricao}
                </p>
              </div>
            )}
        </div>

        {/* RIGHT column — AI Analysis */}
        <div
          style={{
            width: "50%",
            overflowY: "auto",
            paddingBottom: 24,
          }}
        >
          {/* ScoreBar — large, centered */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
            <ScoreBar score={analysis?.score ?? null} />
          </div>

          {/* needs_reanalysis badge */}
          {analysis?.needs_reanalysis === true && (
            <div style={{ marginBottom: 16 }}>
              <span className="badge badge-status-error">Analise incompleta</span>
            </div>
          )}

          {/* Gancho */}
          <AnalysisCard icon={Sparkles} title="Gancho" gradient="linear-gradient(135deg, #f472b6, #c2396e)">
            {analysis?.hook_text ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-start" }}>
                <span style={{ fontSize: 13, color: "var(--text-2)", flex: 1 }}>
                  {analysis.hook_text}
                </span>
                {analysis.hook_type && (
                  <Badge variant="outline" style={{ fontSize: 11, whiteSpace: "nowrap" }}>
                    {analysis.hook_type}
                  </Badge>
                )}
              </div>
            ) : (
              <span style={{ color: "var(--text-3)" }}>{"\u2014"}</span>
            )}
          </AnalysisCard>

          {/* Angulo */}
          <AnalysisCard icon={TrendingUp} title="Ângulo" gradient="linear-gradient(135deg, #e8604a, #f0804a)">
            {analysis?.angle_tag ? (
              <Badge variant="outline" style={{ fontSize: 12 }}>
                {analysis.angle_tag}
              </Badge>
            ) : (
              <span style={{ color: "var(--text-3)" }}>{"\u2014"}</span>
            )}
          </AnalysisCard>

          {/* CTA */}
          <AnalysisCard icon={FileText} title="CTA" gradient="linear-gradient(135deg, #a855f7, #8b5cf6)">
            <span>
              {analysis?.cta_analysis ? (
                analysis.cta_analysis
              ) : (
                <span style={{ color: "var(--text-3)" }}>{"\u2014"}</span>
              )}
            </span>
          </AnalysisCard>

          {/* Estrutura */}
          <AnalysisCard icon={Hash} title="Estrutura" gradient="linear-gradient(135deg, #2563eb, #60a5fa)">
            <span>
              {analysis?.structure_summary ? (
                analysis.structure_summary
              ) : (
                <span style={{ color: "var(--text-3)" }}>{"\u2014"}</span>
              )}
            </span>
          </AnalysisCard>

          {/* Relatorio Estrategico (ads-analyst) */}
          {analysis?.relatorio_skill ? (
            <AnalysisCard icon={FileText} title="Relatorio Estrategico" gradient="linear-gradient(135deg, #f59e0b, #f97316)">
              <div
                className="prose prose-invert prose-sm max-w-none prose-p:text-[var(--text-2)] prose-p:text-[13px] prose-p:leading-relaxed prose-li:text-[var(--text-2)] prose-li:text-[13px]"
                style={{ fontSize: 13, color: "var(--text-2)" }}
              >
                <ReactMarkdown>{analysis.relatorio_skill}</ReactMarkdown>
              </div>
            </AnalysisCard>
          ) : null}

          {/* Insights — markdown rendered */}
          <AnalysisCard icon={Lightbulb} title="Insights" gradient="linear-gradient(135deg, #4ade80, #22c55e)">
            {analysis?.insights ? (
              <div
                className="prose prose-invert prose-sm max-w-none prose-p:text-[var(--text-2)] prose-p:text-[13px] prose-p:leading-relaxed prose-li:text-[var(--text-2)] prose-li:text-[13px]"
                style={{ fontSize: 13, color: "var(--text-2)" }}
              >
                <ReactMarkdown>{analysis.insights}</ReactMarkdown>
              </div>
            ) : (
              <span style={{ color: "var(--text-3)" }}>{"\u2014"}</span>
            )}
          </AnalysisCard>
        </div>
      </div>
    </div>
  );
}
