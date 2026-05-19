import { useState, useEffect, useMemo } from "react";
import { LayoutGrid, List, Download, Loader2, ExternalLink, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import AdCard from "./AdCard";
import DatePicker from "./DatePicker";
import FilterSelect from "./FilterSelect";
import type { AdCreativeWithRelations, FilterState } from "./types";

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

export default function AdList() {
  const [ads, setAds] = useState<AdCreativeWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const stored = localStorage.getItem("ad-intel-view");
    return (stored === "table" ? "table" : "cards") as ViewMode;
  });

  const fetchAds = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from("ad_creatives")
        .select("*, ad_competitors(*), ad_analyses(*)")
        .order("collected_at", { ascending: false });

      if (fetchError) throw fetchError;
      setAds((data as AdCreativeWithRelations[]) || []);
    } catch (err: any) {
      setError(err.message || "Erro ao carregar anuncios.");
      toast.error("Erro ao carregar anuncios.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAds();
  }, []);

  // Persist view mode
  const handleSetViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem("ad-intel-view", mode);
  };

  // Unique grupos and competitors for dropdowns
  const uniqueGrupos = useMemo(() => {
    const gruposSet = new Set<string>();
    ads.forEach(ad => {
      if (ad.ad_competitors.grupo) gruposSet.add(ad.ad_competitors.grupo);
    });
    return Array.from(gruposSet).sort();
  }, [ads]);

  const uniqueCompetitors = useMemo(() => {
    const competitorsMap = new Map<string, string>();
    ads.forEach(ad => {
      if (!competitorsMap.has(ad.competitor_id)) {
        competitorsMap.set(ad.competitor_id, ad.ad_competitors.name);
      }
    });
    return Array.from(competitorsMap.entries()).map(([id, name]) => ({ id, name }));
  }, [ads]);

  // Filtered competitors by grupo
  const filteredCompetitorOptions = useMemo(() => {
    if (!filters.grupo) return uniqueCompetitors;
    return uniqueCompetitors.filter(c => {
      const ad = ads.find(a => a.competitor_id === c.id);
      return ad?.ad_competitors.grupo === filters.grupo;
    });
  }, [uniqueCompetitors, filters.grupo, ads]);

  // Apply all filters
  const filteredAds = useMemo(() => {
    return ads.filter(ad => {
      if (filters.grupo && ad.ad_competitors.grupo !== filters.grupo) return false;
      if (filters.competitorId && ad.competitor_id !== filters.competitorId) return false;
      if (filters.format && ad.creative_type !== filters.format) return false;
      if (
        filters.minScore != null &&
        (ad.ad_analyses?.score == null || ad.ad_analyses.score < filters.minScore)
      ) return false;
      if (filters.startDateFrom && ad.start_date && ad.start_date < filters.startDateFrom) return false;
      if (filters.startDateTo && ad.start_date && ad.start_date > filters.startDateTo) return false;
      if (filters.status && ad.status !== filters.status) return false;
      return true;
    });
  }, [ads, filters]);

  // CSV Export
  const exportCSV = () => {
    const headers = [
      "id", "competitor_name", "grupo", "creative_type", "status",
      "start_date", "end_date", "body_text", "cta_type", "score",
      "hook_text", "hook_type", "angle_tag", "cta_analysis",
      "structure_summary", "insights", "collected_at",
    ];

    const rows = filteredAds.map(ad => [
      ad.id,
      ad.ad_competitors.name,
      ad.ad_competitors.grupo ?? "",
      ad.creative_type ?? "",
      ad.status ?? "",
      ad.start_date ?? "",
      ad.end_date ?? "",
      ad.body_text ?? "",
      ad.cta_type ?? "",
      ad.ad_analyses?.score != null ? String(ad.ad_analyses.score) : "",
      ad.ad_analyses?.hook_text ?? "",
      ad.ad_analyses?.hook_type ?? "",
      ad.ad_analyses?.angle_tag ?? "",
      ad.ad_analyses?.cta_analysis ?? "",
      ad.ad_analyses?.structure_summary ?? "",
      ad.ad_analyses?.insights ?? "",
      ad.collected_at,
    ]);

    const escape = (val: string) => `"${val.replace(/"/g, '""')}"`;
    const csvContent = [
      headers.map(escape).join(","),
      ...rows.map(row => row.map(escape).join(",")),
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `anuncios-export-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Determine active filter count
  const activeFilterCount = Object.values(filters).filter(v => v != null).length;

  // Empty state determination
  const hasAnyAds = ads.length > 0;
  const hasCompetitors = uniqueCompetitors.length > 0;

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "64px 0" }}>
        <Loader2 className="animate-spin" size={24} style={{ color: "var(--text-3)" }} />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ textAlign: "center", padding: "64px 0" }}>
        <p style={{ color: "var(--text-2)", marginBottom: 12 }}>
          Erro ao carregar anuncios. Tente novamente.
        </p>
        <button
          onClick={fetchAds}
          style={{
            background: "var(--cr-grad)",
            color: "white",
            border: "none",
            borderRadius: "var(--radius-md)",
            padding: "8px 16px",
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Filter bar */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 24,
          alignItems: "center",
        }}
      >
        {/* Grupo */}
        <FilterSelect
          value={filters.grupo}
          onChange={val => setFilters(f => ({ ...f, grupo: val, competitorId: null }))}
          options={uniqueGrupos.map(g => ({ value: g, label: g }))}
          placeholder="Todos os grupos"
        />

        {/* Concorrente */}
        <FilterSelect
          value={filters.competitorId}
          onChange={val => setFilters(f => ({ ...f, competitorId: val }))}
          options={filteredCompetitorOptions.map(c => ({ value: c.id, label: c.name }))}
          placeholder="Todos os concorrentes"
        />

        {/* Formato */}
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

        {/* Score minimo */}
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

        {/* Data inicio de */}
        <DatePicker
          value={filters.startDateFrom}
          onChange={val => setFilters(f => ({ ...f, startDateFrom: val }))}
          placeholder="Data de"
        />

        {/* Data inicio ate */}
        <DatePicker
          value={filters.startDateTo}
          onChange={val => setFilters(f => ({ ...f, startDateTo: val }))}
          placeholder="Data até"
        />

        {/* Status */}
        <FilterSelect
          value={filters.status}
          onChange={val => setFilters(f => ({ ...f, status: val as FilterState["status"] }))}
          options={[
            { value: "ativo", label: "Ativo" },
            { value: "inativo", label: "Inativo" },
          ]}
          placeholder="Todos os status"
        />

        {/* Active filter count badge */}
        {activeFilterCount > 0 && (
          <span className="badge badge-accent" style={{ fontSize: 11 }}>
            {activeFilterCount} filtro{activeFilterCount !== 1 ? "s" : ""} ativo{activeFilterCount !== 1 ? "s" : ""}
          </span>
        )}

        {/* Right side: view toggle + export */}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          {/* View toggle */}
          <div style={{ display: "flex", gap: 4 }}>
            <button
              onClick={() => handleSetViewMode("cards")}
              title="Cards"
              style={{
                background: viewMode === "cards" ? "var(--cr-grad)" : "transparent",
                color: viewMode === "cards" ? "white" : "var(--text-3)",
                border: viewMode === "cards" ? "none" : "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                width: 36,
                height: 36,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.15s",
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
                borderRadius: "var(--radius-md)",
                width: 36,
                height: 36,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.15s",
              }}
            >
              <List size={16} />
            </button>
          </div>

          {/* Export CSV */}
          <button
            onClick={exportCSV}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "transparent",
              color: "var(--text-2)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              padding: "0 12px",
              height: 36,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 500,
              transition: "all 0.15s",
            }}
          >
            <Download size={14} />
            Exportar CSV
          </button>

          {/* Delete all */}
          {ads.length > 0 && (
            <button
              onClick={async () => {
                if (!confirm(`Excluir todos os ${ads.length} anuncios? Isso nao pode ser desfeito.`)) return;
                try {
                  // Delete analyses first (FK), then creatives
                  const ids = ads.map(a => a.id);
                  await supabase.from("ad_analyses").delete().in("creative_id", ids);
                  await supabase.from("ad_creatives").delete().in("id", ids);
                  toast.success("Todos os anuncios excluidos!");
                  fetchAds();
                } catch (err: any) {
                  toast.error(`Erro ao excluir: ${err.message}`);
                }
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "transparent",
                color: "var(--danger, #ef4444)",
                border: "1px solid var(--danger, #ef4444)",
                borderRadius: "var(--radius-md)",
                padding: "0 12px",
                height: 36,
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 500,
                transition: "all 0.15s",
              }}
            >
              <Trash2 size={14} />
              Excluir todos
            </button>
          )}
        </div>
      </div>

      {/* Content area */}
      {!hasCompetitors ? (
        /* Empty state: no competitors */
        <div style={{ textAlign: "center", padding: "64px 0" }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-1)", marginBottom: 8 }}>
            Nenhum concorrente monitorado
          </h3>
          <p style={{ fontSize: 13, color: "var(--text-3)" }}>
            Adicione um concorrente na aba Concorrentes para comecar a coletar anuncios.
          </p>
        </div>
      ) : !hasAnyAds ? (
        /* Empty state: competitors exist but no ads */
        <div style={{ textAlign: "center", padding: "64px 0" }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-1)", marginBottom: 8 }}>
            Nenhum anuncio coletado ainda
          </h3>
          <p style={{ fontSize: 13, color: "var(--text-3)" }}>
            Clique em Coletar Anuncios na aba Concorrentes para iniciar a coleta.
          </p>
        </div>
      ) : filteredAds.length === 0 ? (
        /* Empty state: filters active but no results */
        <div style={{ textAlign: "center", padding: "64px 0" }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-1)", marginBottom: 8 }}>
            Nenhum anuncio encontrado
          </h3>
          <p style={{ fontSize: 13, color: "var(--text-3)" }}>
            Tente remover alguns filtros para ver mais resultados.
          </p>
        </div>
      ) : viewMode === "cards" ? (
        /* Cards grid - grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)) */
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 16,
          }}
        >
          {filteredAds.map(ad => (
            <AdCard key={ad.id} ad={ad} />
          ))}
        </div>
      ) : (
        /* Table view */
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 12, fontWeight: 600, color: "var(--text-3)", borderBottom: "1px solid var(--border)" }}>Thumb</th>
                <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 12, fontWeight: 600, color: "var(--text-3)", borderBottom: "1px solid var(--border)" }}>Concorrente</th>
                <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 12, fontWeight: 600, color: "var(--text-3)", borderBottom: "1px solid var(--border)" }}>Formato</th>
                <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 12, fontWeight: 600, color: "var(--text-3)", borderBottom: "1px solid var(--border)" }}>Status</th>
                <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 12, fontWeight: 600, color: "var(--text-3)", borderBottom: "1px solid var(--border)" }}>Score</th>
                <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 12, fontWeight: 600, color: "var(--text-3)", borderBottom: "1px solid var(--border)" }}>Data Inicio</th>
                <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 12, fontWeight: 600, color: "var(--text-3)", borderBottom: "1px solid var(--border)" }}>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {filteredAds.map(ad => {
                const formatBadge = getFormatBadge(ad.creative_type);
                const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
                return (
                  <motion.tr
                    key={ad.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    style={{ borderBottom: "1px solid var(--border)", cursor: "pointer" }}
                  >
                    <td style={{ padding: "8px 12px" }}>
                      <Link to={`/ad-intelligence/${ad.id}`} style={{ display: "block" }}>
                        {(ad.storage_image_path || ad.thumbnail_url) ? (
                          <img
                            src={ad.storage_image_path
                              ? `${supabaseUrl}/storage/v1/object/public/ad-media/${ad.storage_image_path}`
                              : ad.thumbnail_url!}
                            alt="thumb"
                            style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 4 }}
                          />
                        ) : (
                          <div style={{ width: 48, height: 48, background: "var(--surface)", borderRadius: 4 }} />
                        )}
                      </Link>
                    </td>
                    <td style={{ padding: "8px 12px", fontSize: 13, color: "var(--text-1)" }}>
                      <Link to={`/ad-intelligence/${ad.id}`} style={{ color: "inherit", textDecoration: "none" }}>
                        {ad.ad_competitors.name}
                      </Link>
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      <span className={formatBadge.className}>{formatBadge.label}</span>
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      <span className={`badge ${ad.status === "ativo" ? "badge-status-done" : "badge-status-pending"}`}>
                        {ad.status === "ativo" ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      <ScoreBar score={ad.ad_analyses?.score ?? null} />
                    </td>
                    <td style={{ padding: "8px 12px", fontSize: 13, color: "var(--text-2)" }}>
                      {ad.start_date ? new Date(ad.start_date).toLocaleDateString() : "—"}
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      <Link
                        to={`/ad-intelligence/${ad.id}`}
                        style={{ color: "var(--text-3)", display: "inline-flex" }}
                        title="Ver detalhe"
                      >
                        <ExternalLink size={16} />
                      </Link>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
