import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ChevronLeft, LayoutGrid, List, Download, FileText, Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import AdCard from "./AdCard";
import FilterSelect from "./FilterSelect";
import DatePicker from "./DatePicker";
import type { AdCreativeWithRelations, AdCompetitor, FilterState } from "./types";

function ScoreBar({ score }: { score: number | null }) {
  if (score == null) return <span style={{ color: "var(--text-3)", fontSize: 12 }}>--</span>;
  const level = score >= 8 ? "high" : score >= 6 ? "mid" : "low";
  const filled = Math.round(score / 2);
  return (
    <div className="score-bar">
      <div className="score-dots">
        {[0,1,2,3,4].map(i => <div key={i} className={`score-dot ${i < filled ? `filled-${level}` : "empty"}`} />)}
      </div>
      <span className={`score-num ${level}`}>{score}</span>
    </div>
  );
}

function getFormatBadge(type: string | null): { className: string; label: string } {
  const t = (type || "").toLowerCase();
  if (t === "video") return { className: "badge badge-video", label: "Video" };
  if (t === "carousel") return { className: "badge badge-carousel", label: "Carrossel" };
  return { className: "badge badge-image", label: "Imagem" };
}

type ViewMode = "cards" | "table";

const INITIAL_FILTERS: FilterState = {
  grupo: null,
  competitorId: null,
  format: null,
  minScore: null,
  startDateFrom: null,
  startDateTo: null,
  status: null,
};

export default function CompetitorAdsPage() {
  const { competitorId } = useParams<{ competitorId: string }>();
  const navigate = useNavigate();
  const [competitor, setCompetitor] = useState<AdCompetitor | null>(null);
  const [ads, setAds] = useState<AdCreativeWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const stored = localStorage.getItem("ad-intel-view");
    return (stored === "table" ? "table" : "cards") as ViewMode;
  });

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;

  const fetchData = async () => {
    if (!competitorId) return;
    setLoading(true);
    try {
      const [compRes, adsRes] = await Promise.all([
        supabase.from("ad_competitors").select("*").eq("id", competitorId).single(),
        supabase.from("ad_creatives").select("*, ad_competitors(*), ad_analyses(*)").eq("competitor_id", competitorId).order("collected_at", { ascending: false }),
      ]);
      if (compRes.data) setCompetitor(compRes.data as AdCompetitor);
      setAds((adsRes.data as AdCreativeWithRelations[]) || []);
    } catch {
      toast.error("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [competitorId]);

  const handleSetViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem("ad-intel-view", mode);
  };

  const filteredAds = useMemo(() => {
    return ads.filter((ad) => {
      if (filters.format && ad.creative_type !== filters.format) return false;
      if (filters.minScore != null) {
        const score = ad.ad_analyses?.score ?? 0;
        if (score < filters.minScore) return false;
      }
      if (filters.startDateFrom && ad.start_date && ad.start_date < filters.startDateFrom) return false;
      if (filters.startDateTo && ad.start_date && ad.start_date > filters.startDateTo) return false;
      if (filters.status && ad.status !== filters.status) return false;
      return true;
    });
  }, [ads, filters]);

  const activeFilterCount = Object.values(filters).filter(v => v != null).length;

  const exportCSV = () => {
    if (!filteredAds.length) return;
    const headers = ["ID", "Tipo", "Status", "Score", "Copy", "Transcricao", "Gancho", "Angulo", "CTA", "Estrutura", "Insights", "Data Inicio", "URL"];
    const rows = filteredAds.map((ad) => [
      ad.ad_id || "",
      ad.creative_type || "",
      ad.status || "",
      ad.ad_analyses?.score?.toString() || "",
      ad.body_text || "",
      ad.transcricao || "",
      ad.ad_analyses?.hook_text || "",
      ad.ad_analyses?.angle_tag || "",
      ad.ad_analyses?.cta_analysis || "",
      ad.ad_analyses?.structure_summary || "",
      ad.ad_analyses?.insights || "",
      ad.start_date || "",
      ad.ad_url || "",
    ]);
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = [headers.map(escape).join(","), ...rows.map(r => r.map(escape).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `anuncios-${competitor?.name || "export"}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const exportDOCX = () => {
    if (!filteredAds.length) return;
    const formatDate = (d: string) => {
      if (!d) return "";
      return new Date(d).toLocaleDateString("pt-BR");
    };
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    let cardsHtml = "";

    filteredAds.forEach((ad, index) => {
      if (index > 0) {
        cardsHtml += `<br clear="all" style="page-break-before:always">`;
      }

      const fields = [
        ["ID", ad.ad_id || ""],
        ["Tipo", ad.creative_type || ""],
        ["Status", ad.status || ""],
        ["Score", ad.ad_analyses?.score?.toString() || ""],
        ["Data", formatDate(ad.start_date || "")],
        ["URL", ad.ad_url || ""],
        ["Copy", ad.body_text || ""],
        ["Transcricao", ad.transcricao || ""],
        ["Gancho", ad.ad_analyses?.hook_text || ""],
        ["Angulo", ad.ad_analyses?.angle_tag || ""],
        ["CTA", ad.ad_analyses?.cta_analysis || ""],
        ["Estrutura", ad.ad_analyses?.structure_summary || ""],
        ["Insights", ad.ad_analyses?.insights || ""],
      ];

      const rows = fields.map(([label, value], i) => `
        <tr>
          <td style="background:#1a1a2e;color:#fff;font-weight:bold;padding:6px 10px;width:120px;font-size:9pt;border:1px solid #d9d9d9">${esc(label)}</td>
          <td style="padding:6px 10px;font-size:9pt;color:#333;border:1px solid #d9d9d9;${i % 2 === 1 ? "background:#f5f5f7" : ""}">${esc(value) || '<span style="color:#aaa">\u2014</span>'}</td>
        </tr>
      `).join("");

      cardsHtml += `
        <p style="font-size:11pt;font-weight:bold;color:#1a1a2e;margin:0 0 6pt 0;font-family:Arial">Anuncio ${index + 1}</p>
        <table style="width:100%;border-collapse:collapse;font-family:Arial">${rows}</table>
      `;
    });

    const html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="utf-8"><style>
        @page { margin: 2cm; }
        body { font-family: Arial, sans-serif; }
      </style></head>
      <body>
        <h1 style="font-size:15pt;margin:0 0 4pt 0;font-family:Arial">Anuncios - ${esc(competitor?.name || "Export")}</h1>
        <p style="font-size:9pt;color:#888;margin:0 0 14pt 0;font-family:Arial">${filteredAds.length} anuncios &bull; Exportado em ${new Date().toLocaleDateString("pt-BR")}</p>
        ${cardsHtml}
      </body></html>
    `;

    const blob = new Blob(["\ufeff" + html], { type: "application/msword" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `anuncios-${competitor?.name || "export"}-${new Date().toISOString().slice(0, 10)}.doc`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "50vh" }}>
        <Loader2 size={24} className="animate-spin" style={{ color: "var(--text-3)" }} />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="page-header" style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          className="icon-btn"
          style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => navigate("/ad-intelligence")}
        >
          <ChevronLeft size={20} />
        </button>
        <div style={{ flex: 1 }}>
          <h1 className="page-header-title" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700 }}>
            {competitor?.name || "Concorrente"}
          </h1>
          <p className="page-header-sub">{ads.length} anuncios coletados</p>
        </div>
      </div>

      <div className="page-content">
        {/* Filters */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24, alignItems: "center" }}>
          <FilterSelect
            value={filters.format}
            onChange={val => setFilters(f => ({ ...f, format: val as FilterState["format"] }))}
            options={[
              { value: "video", label: "Video" },
              { value: "image", label: "Imagem" },
              { value: "carousel", label: "Carrossel" },
            ]}
            placeholder="Todos os formatos"
          />
          <FilterSelect
            value={filters.minScore != null ? String(filters.minScore) : null}
            onChange={val => setFilters(f => ({ ...f, minScore: val ? Number(val) : null }))}
            options={[
              { value: "7", label: "Score 7+" },
              { value: "8", label: "Score 8+" },
              { value: "9", label: "Score 9+" },
            ]}
            placeholder="Qualquer score"
          />
          <DatePicker value={filters.startDateFrom} onChange={val => setFilters(f => ({ ...f, startDateFrom: val }))} placeholder="Data de" />
          <DatePicker value={filters.startDateTo} onChange={val => setFilters(f => ({ ...f, startDateTo: val }))} placeholder="Data ate" />
          <FilterSelect
            value={filters.status}
            onChange={val => setFilters(f => ({ ...f, status: val as FilterState["status"] }))}
            options={[
              { value: "ativo", label: "Ativo" },
              { value: "inativo", label: "Inativo" },
            ]}
            placeholder="Todos os status"
          />

          {activeFilterCount > 0 && (
            <span className="badge badge-accent" style={{ fontSize: 11 }}>
              {activeFilterCount} filtro{activeFilterCount !== 1 ? "s" : ""} ativo{activeFilterCount !== 1 ? "s" : ""}
            </span>
          )}

          {/* Right: view toggle + export + delete */}
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ display: "flex", gap: 4 }}>
              <button
                onClick={() => handleSetViewMode("cards")}
                title="Cards"
                style={{
                  background: viewMode === "cards" ? "var(--cr-grad)" : "transparent",
                  color: viewMode === "cards" ? "white" : "var(--text-3)",
                  border: viewMode === "cards" ? "none" : "1px solid var(--border)",
                  borderRadius: "var(--radius-md)", width: 36, height: 36, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <LayoutGrid size={16} />
              </button>
              <button
                onClick={() => handleSetViewMode("table")}
                title="Tabela"
                style={{
                  background: viewMode === "table" ? "var(--cr-grad)" : "transparent",
                  color: viewMode === "table" ? "white" : "var(--text-3)",
                  border: viewMode === "table" ? "none" : "1px solid var(--border)",
                  borderRadius: "var(--radius-md)", width: 36, height: 36, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <List size={16} />
              </button>
            </div>
            <button
              onClick={exportCSV}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                background: "transparent", color: "var(--text-2)",
                border: "1px solid var(--border)", borderRadius: "var(--radius-md)",
                padding: "0 12px", height: 36, cursor: "pointer", fontSize: 13, fontWeight: 500,
              }}
            >
              <Download size={14} /> Exportar CSV
            </button>
            <button
              onClick={exportDOCX}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                background: "transparent", color: "var(--text-2)",
                border: "1px solid var(--border)", borderRadius: "var(--radius-md)",
                padding: "0 12px", height: 36, cursor: "pointer", fontSize: 13, fontWeight: 500,
              }}
            >
              <FileText size={14} /> Exportar DOC
            </button>
            {ads.length > 0 && (
              <button
                onClick={async () => {
                  if (!confirm(`Excluir todos os ${ads.length} anuncios deste concorrente?`)) return;
                  try {
                    const ids = ads.map(a => a.id);
                    await supabase.from("ad_analyses").delete().in("creative_id", ids);
                    await supabase.from("ad_creatives").delete().in("id", ids);
                    toast.success("Anuncios excluidos!");
                    fetchData();
                  } catch (err: any) {
                    toast.error(`Erro: ${err.message}`);
                  }
                }}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: "transparent", color: "var(--danger, #ef4444)",
                  border: "1px solid var(--danger, #ef4444)", borderRadius: "var(--radius-md)",
                  padding: "0 12px", height: 36, cursor: "pointer", fontSize: 13, fontWeight: 500,
                }}
              >
                <Trash2 size={14} /> Excluir todos
              </button>
            )}
          </div>
        </div>

        {/* Empty state */}
        {filteredAds.length === 0 && (
          <div style={{ textAlign: "center", padding: "64px 0", color: "var(--text-3)" }}>
            <p style={{ fontSize: 14 }}>Nenhum anuncio encontrado.</p>
            {activeFilterCount > 0 && (
              <button onClick={() => setFilters(INITIAL_FILTERS)} style={{ marginTop: 8, background: "transparent", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "8px 16px", cursor: "pointer", color: "var(--text-2)", fontSize: 13 }}>
                Limpar filtros
              </button>
            )}
          </div>
        )}

        {/* Cards view */}
        {viewMode === "cards" && filteredAds.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
            {filteredAds.map((ad) => (
              <AdCard key={ad.id} ad={ad} />
            ))}
          </div>
        )}

        {/* Table view */}
        {viewMode === "table" && filteredAds.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th style={{ padding: "8px 12px", textAlign: "left", color: "var(--text-3)", fontWeight: 600, fontSize: 11 }}>Thumb</th>
                  <th style={{ padding: "8px 12px", textAlign: "left", color: "var(--text-3)", fontWeight: 600, fontSize: 11 }}>Formato</th>
                  <th style={{ padding: "8px 12px", textAlign: "left", color: "var(--text-3)", fontWeight: 600, fontSize: 11 }}>Status</th>
                  <th style={{ padding: "8px 12px", textAlign: "left", color: "var(--text-3)", fontWeight: 600, fontSize: 11 }}>Score</th>
                  <th style={{ padding: "8px 12px", textAlign: "left", color: "var(--text-3)", fontWeight: 600, fontSize: 11 }}>Gancho</th>
                  <th style={{ padding: "8px 12px", textAlign: "left", color: "var(--text-3)", fontWeight: 600, fontSize: 11 }}>Data</th>
                </tr>
              </thead>
              <tbody>
                {filteredAds.map((ad) => {
                  const badge = getFormatBadge(ad.creative_type);
                  return (
                    <tr
                      key={ad.id}
                      onClick={() => navigate(`/ad-intelligence/ad/${ad.id}`)}
                      style={{ borderBottom: "1px solid var(--border)", cursor: "pointer", transition: "background 0.1s" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <td style={{ padding: "8px 12px" }}>
                        {(ad.storage_image_path || ad.thumbnail_url) ? (
                          <img
                            src={ad.storage_image_path ? `${supabaseUrl}/storage/v1/object/public/ad-media/${ad.storage_image_path}` : ad.thumbnail_url!}
                            alt="thumb"
                            style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 4 }}
                          />
                        ) : (
                          <div style={{ width: 48, height: 48, background: "var(--surface)", borderRadius: 4 }} />
                        )}
                      </td>
                      <td style={{ padding: "8px 12px" }}><span className={badge.className}>{badge.label}</span></td>
                      <td style={{ padding: "8px 12px" }}>
                        <span className={`badge ${ad.status === "ativo" ? "badge-status-done" : "badge-status-pending"}`}>
                          {ad.status === "ativo" ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td style={{ padding: "8px 12px" }}><ScoreBar score={ad.ad_analyses?.score ?? null} /></td>
                      <td style={{ padding: "8px 12px", fontSize: 12, color: "var(--text-2)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {ad.ad_analyses?.hook_text || "\u2014"}
                      </td>
                      <td style={{ padding: "8px 12px", fontSize: 12, color: "var(--text-3)", whiteSpace: "nowrap" }}>
                        {ad.start_date ? new Date(ad.start_date).toLocaleDateString("pt-BR") : "\u2014"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
