import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ChevronLeft, Loader2, ArrowRight, Trophy, BarChart3, Target, Film, Image, Layers, ChevronDown, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { AdCompetitor, AdCreative, AdAnalysis } from "./types";

interface CreativeWithAnalysis extends AdCreative {
  ad_analyses: AdAnalysis | null;
}

interface CompetitorStats {
  competitor: AdCompetitor;
  totalAds: number;
  avgScore: number | null;
  scoreHigh: number; // 8+
  scoreMid: number;  // 6-7
  scoreLow: number;  // below 6
  hookTypes: Record<string, number>;
  angles: Record<string, number>;
  formatVideo: number;
  formatImage: number;
  formatCarousel: number;
  topAds: CreativeWithAnalysis[];
}

function computeStats(competitor: AdCompetitor, ads: CreativeWithAnalysis[]): CompetitorStats {
  const analyzed = ads.filter(a => a.ad_analyses?.score != null);
  const scores = analyzed.map(a => a.ad_analyses!.score!);
  const avgScore = scores.length > 0 ? Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 10) / 10 : null;

  const hookTypes: Record<string, number> = {};
  const angles: Record<string, number> = {};

  for (const ad of ads) {
    const ht = ad.ad_analyses?.hook_type;
    if (ht) hookTypes[ht] = (hookTypes[ht] || 0) + 1;
    const at = ad.ad_analyses?.angle_tag;
    if (at) angles[at] = (angles[at] || 0) + 1;
  }

  const formatVideo = ads.filter(a => (a.creative_type || "").toLowerCase() === "video").length;
  const formatImage = ads.filter(a => (a.creative_type || "").toLowerCase() === "image").length;
  const formatCarousel = ads.filter(a => (a.creative_type || "").toLowerCase() === "carousel").length;

  const topAds = [...ads]
    .filter(a => a.ad_analyses?.score != null)
    .sort((a, b) => (b.ad_analyses!.score!) - (a.ad_analyses!.score!))
    .slice(0, 3);

  return {
    competitor,
    totalAds: ads.length,
    avgScore,
    scoreHigh: scores.filter(s => s >= 8).length,
    scoreMid: scores.filter(s => s >= 6 && s < 8).length,
    scoreLow: scores.filter(s => s < 6).length,
    hookTypes,
    angles,
    formatVideo,
    formatImage,
    formatCarousel,
    topAds,
  };
}

function pct(part: number, total: number): string {
  if (total === 0) return "0%";
  return Math.round((part / total) * 100) + "%";
}

function topN(map: Record<string, number>, n: number): [string, number][] {
  return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, n);
}

/* ── Reusable sub-components ── */

function StatCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-md)",
      padding: 16,
    }}>
      <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function BigNumber({ value, sub }: { value: string | number; sub?: string }) {
  return (
    <div>
      <span style={{ fontSize: 28, fontWeight: 700, color: "var(--text-1)" }}>{value}</span>
      {sub && <span style={{ fontSize: 12, color: "var(--text-3)", marginLeft: 4 }}>{sub}</span>}
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const bg = score >= 8 ? "#22c55e" : score >= 6 ? "#eab308" : "#ef4444";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      background: bg, color: "#000", fontWeight: 700, fontSize: 12,
      borderRadius: 6, width: 28, height: 22,
    }}>
      {score}
    </span>
  );
}

function BarRow({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const w = total > 0 ? Math.max((count / total) * 100, 2) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
      <span style={{ fontSize: 12, color: "var(--text-2)", width: 80, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 8, background: "var(--border)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${w}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.3s" }} />
      </div>
      <span style={{ fontSize: 11, color: "var(--text-3)", width: 36, textAlign: "right" }}>{count}</span>
    </div>
  );
}

function MiniAdCard({ ad }: { ad: CreativeWithAnalysis }) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const thumbSrc = ad.storage_image_path
    ? `${supabaseUrl}/storage/v1/object/public/ad-media/${ad.storage_image_path}`
    : ad.thumbnail_url;

  return (
    <Link
      to={`/ad-intelligence/ad/${ad.id}`}
      style={{
        display: "flex", gap: 10, alignItems: "center", textDecoration: "none",
        padding: 10, borderRadius: "var(--radius-md)", border: "1px solid var(--border)",
        background: "var(--bg)", transition: "border-color 0.15s",
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--accent)")}
      onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
    >
      {thumbSrc ? (
        <img src={thumbSrc} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 4, flexShrink: 0 }} />
      ) : (
        <div style={{ width: 48, height: 48, background: "var(--surface)", borderRadius: 4, flexShrink: 0 }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {ad.ad_analyses?.hook_text || "Sem gancho"}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
          {ad.ad_analyses?.hook_type || ""} {ad.ad_analyses?.angle_tag ? `/ ${ad.ad_analyses.angle_tag}` : ""}
        </div>
      </div>
      {ad.ad_analyses?.score != null && <ScoreBadge score={ad.ad_analyses.score} />}
    </Link>
  );
}

/* ── Main page component ── */

export default function CompareCompetitorsPage() {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const [competitors, setCompetitors] = useState<AdCompetitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [compAId, setCompAId] = useState<string | null>(null);
  const [compBId, setCompBId] = useState<string | null>(null);
  const [adsA, setAdsA] = useState<CreativeWithAnalysis[]>([]);
  const [adsB, setAdsB] = useState<CreativeWithAnalysis[]>([]);
  const [loadingAds, setLoadingAds] = useState(false);

  // Fetch competitors list (filtered by user)
  useEffect(() => {
    (async () => {
      try {
        let query = supabase
          .from("ad_competitors")
          .select("*")
          .order("name");

        if (role !== "admin" && user?.id) {
          query = query.eq("user_id", user.id);
        }

        const { data, error } = await query;
        if (error) throw error;
        setCompetitors((data || []) as AdCompetitor[]);
      } catch {
        toast.error("Erro ao carregar concorrentes");
      } finally {
        setLoading(false);
      }
    })();
  }, [role, user?.id]);

  // Fetch ads when selections change
  useEffect(() => {
    if (!compAId || !compBId) {
      setAdsA([]);
      setAdsB([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingAds(true);
      try {
        const [resA, resB] = await Promise.all([
          supabase.from("ad_creatives").select("*, ad_analyses(*)").eq("competitor_id", compAId),
          supabase.from("ad_creatives").select("*, ad_analyses(*)").eq("competitor_id", compBId),
        ]);
        if (cancelled) return;
        setAdsA((resA.data || []) as CreativeWithAnalysis[]);
        setAdsB((resB.data || []) as CreativeWithAnalysis[]);
      } catch {
        toast.error("Erro ao carregar anuncios");
      } finally {
        if (!cancelled) setLoadingAds(false);
      }
    })();
    return () => { cancelled = true; };
  }, [compAId, compBId]);

  const compA = competitors.find(c => c.id === compAId) || null;
  const compB = competitors.find(c => c.id === compBId) || null;

  const statsA = useMemo(() => compA ? computeStats(compA, adsA) : null, [compA, adsA]);
  const statsB = useMemo(() => compB ? computeStats(compB, adsB) : null, [compB, adsB]);

  // Custom dropdown component
  function CompetitorDropdown({ value, onChange, placeholder, excludeId }: {
    value: string | null;
    onChange: (id: string | null) => void;
    placeholder: string;
    excludeId: string | null;
  }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const selected = competitors.find(c => c.id === value);
    const options = competitors.filter(c => c.id !== excludeId);

    useEffect(() => {
      const handler = (e: MouseEvent) => {
        if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
      };
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }, []);

    return (
      <div ref={ref} style={{ position: "relative", flex: 1, minWidth: 200 }}>
        <button
          onClick={() => setOpen(!open)}
          style={{
            width: "100%",
            height: 40,
            padding: "0 36px 0 14px",
            fontSize: 13,
            fontWeight: 500,
            background: "var(--surface)",
            border: open ? "1px solid var(--accent)" : "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            color: selected ? "var(--text-1)" : "var(--text-3)",
            cursor: "pointer",
            textAlign: "left",
            position: "relative",
            transition: "border-color 0.15s",
          }}
        >
          {selected ? `${selected.name}${selected.grupo ? ` (${selected.grupo})` : ""}` : placeholder}
          <ChevronDown size={14} style={{ position: "absolute", right: 12, top: "50%", transform: `translateY(-50%) rotate(${open ? 180 : 0}deg)`, color: "var(--text-3)", transition: "transform 0.15s" }} />
        </button>
        {open && (
          <div style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            zIndex: 30,
            maxHeight: 240,
            overflowY: "auto",
            padding: 4,
          }}>
            {/* Clear option */}
            {value && (
              <button
                onClick={() => { onChange(null); setOpen(false); }}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  fontSize: 13,
                  color: "var(--text-3)",
                  background: "transparent",
                  border: "none",
                  borderRadius: "var(--radius)",
                  cursor: "pointer",
                  textAlign: "left",
                  fontStyle: "italic",
                }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--surface)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                Limpar selecao
              </button>
            )}
            {options.map(c => (
              <button
                key={c.id}
                onClick={() => { onChange(c.id); setOpen(false); }}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  fontSize: 13,
                  color: c.id === value ? "var(--text-1)" : "var(--text-2)",
                  background: "transparent",
                  border: "none",
                  borderRadius: "var(--radius)",
                  cursor: "pointer",
                  textAlign: "left",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  fontWeight: c.id === value ? 600 : 400,
                }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--surface)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <span>{c.name}{c.grupo ? ` (${c.grupo})` : ""}</span>
                {c.id === value && <Check size={14} style={{ color: "var(--accent)" }} />}
              </button>
            ))}
            {options.length === 0 && (
              <div style={{ padding: "12px", fontSize: 13, color: "var(--text-3)", textAlign: "center" }}>
                Nenhum concorrente disponivel
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  const colStyle: React.CSSProperties = {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  };

  const hasComparison = statsA && statsB;

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
            Comparar Concorrentes
          </h1>
          <p className="page-header-sub">Selecione dois concorrentes para comparar metricas lado a lado</p>
        </div>
      </div>

      <div className="page-content">
        {/* Selectors */}
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
            <Loader2 size={24} className="animate-spin" style={{ color: "var(--text-3)" }} />
          </div>
        ) : (
          <>
            <div style={{
              display: "flex", gap: 12, alignItems: "center", marginBottom: 32, flexWrap: "wrap",
            }}>
              <CompetitorDropdown
                value={compAId}
                onChange={setCompAId}
                placeholder="Selecione o 1° concorrente"
                excludeId={compBId}
              />

              <ArrowRight size={20} style={{ color: "var(--text-3)", flexShrink: 0 }} />

              <CompetitorDropdown
                value={compBId}
                onChange={setCompBId}
                placeholder="Selecione o 2° concorrente"
                excludeId={compAId}
              />
            </div>

            {/* Loading ads */}
            {loadingAds && (
              <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
                <Loader2 size={24} className="animate-spin" style={{ color: "var(--text-3)" }} />
              </div>
            )}

            {/* Empty state */}
            {!loadingAds && !hasComparison && (
              <div style={{ textAlign: "center", padding: "64px 0", color: "var(--text-3)" }}>
                <BarChart3 size={40} style={{ margin: "0 auto 16px", opacity: 0.3 }} />
                <p style={{ fontSize: 14 }}>Selecione dois concorrentes acima para ver a comparacao.</p>
              </div>
            )}

            {/* Comparison grid */}
            {!loadingAds && hasComparison && statsA && statsB && (
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                {/* Column A */}
                <div style={colStyle}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)", marginBottom: 4, textAlign: "center" }}>
                    {statsA.competitor.name}
                  </div>

                  {/* Total ads */}
                  <StatCard label="Total de anuncios">
                    <BigNumber value={statsA.totalAds} sub="anuncios" />
                  </StatCard>

                  {/* Avg score */}
                  <StatCard label="Score medio">
                    <BigNumber value={statsA.avgScore != null ? statsA.avgScore : "--"} />
                  </StatCard>

                  {/* Score distribution */}
                  <StatCard label="Distribuicao de scores">
                    <BarRow label="8+" count={statsA.scoreHigh} total={statsA.totalAds} color="#22c55e" />
                    <BarRow label="6-7" count={statsA.scoreMid} total={statsA.totalAds} color="#eab308" />
                    <BarRow label="< 6" count={statsA.scoreLow} total={statsA.totalAds} color="#ef4444" />
                  </StatCard>

                  {/* Hook types */}
                  <StatCard label="Tipos de gancho mais comuns">
                    {topN(statsA.hookTypes, 5).length === 0 && <span style={{ fontSize: 12, color: "var(--text-3)" }}>Sem dados</span>}
                    {topN(statsA.hookTypes, 5).map(([type, count]) => (
                      <div key={type} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: "var(--text-2)" }}>{type}</span>
                        <span style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600 }}>{count} ({pct(count, statsA.totalAds)})</span>
                      </div>
                    ))}
                  </StatCard>

                  {/* Angles */}
                  <StatCard label="Angulos mais comuns">
                    {topN(statsA.angles, 5).length === 0 && <span style={{ fontSize: 12, color: "var(--text-3)" }}>Sem dados</span>}
                    {topN(statsA.angles, 5).map(([angle, count]) => (
                      <div key={angle} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: "var(--text-2)" }}>{angle}</span>
                        <span style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600 }}>{count} ({pct(count, statsA.totalAds)})</span>
                      </div>
                    ))}
                  </StatCard>

                  {/* Format breakdown */}
                  <StatCard label="Formatos">
                    <div style={{ display: "flex", gap: 16 }}>
                      <div style={{ textAlign: "center", flex: 1 }}>
                        <Film size={16} style={{ color: "var(--text-3)", margin: "0 auto 4px" }} />
                        <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-1)" }}>{pct(statsA.formatVideo, statsA.totalAds)}</div>
                        <div style={{ fontSize: 11, color: "var(--text-3)" }}>Video</div>
                      </div>
                      <div style={{ textAlign: "center", flex: 1 }}>
                        <Image size={16} style={{ color: "var(--text-3)", margin: "0 auto 4px" }} />
                        <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-1)" }}>{pct(statsA.formatImage, statsA.totalAds)}</div>
                        <div style={{ fontSize: 11, color: "var(--text-3)" }}>Imagem</div>
                      </div>
                      <div style={{ textAlign: "center", flex: 1 }}>
                        <Layers size={16} style={{ color: "var(--text-3)", margin: "0 auto 4px" }} />
                        <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-1)" }}>{pct(statsA.formatCarousel, statsA.totalAds)}</div>
                        <div style={{ fontSize: 11, color: "var(--text-3)" }}>Carrossel</div>
                      </div>
                    </div>
                  </StatCard>

                  {/* Top 3 ads */}
                  <StatCard label="Top 3 anuncios">
                    {statsA.topAds.length === 0 && <span style={{ fontSize: 12, color: "var(--text-3)" }}>Sem anuncios analisados</span>}
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {statsA.topAds.map(ad => <MiniAdCard key={ad.id} ad={ad} />)}
                    </div>
                  </StatCard>
                </div>

                {/* Divider */}
                <div style={{ width: 1, background: "var(--border)", alignSelf: "stretch", flexShrink: 0 }} />

                {/* Column B */}
                <div style={colStyle}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)", marginBottom: 4, textAlign: "center" }}>
                    {statsB.competitor.name}
                  </div>

                  <StatCard label="Total de anuncios">
                    <BigNumber value={statsB.totalAds} sub="anuncios" />
                  </StatCard>

                  <StatCard label="Score medio">
                    <BigNumber value={statsB.avgScore != null ? statsB.avgScore : "--"} />
                  </StatCard>

                  <StatCard label="Distribuicao de scores">
                    <BarRow label="8+" count={statsB.scoreHigh} total={statsB.totalAds} color="#22c55e" />
                    <BarRow label="6-7" count={statsB.scoreMid} total={statsB.totalAds} color="#eab308" />
                    <BarRow label="< 6" count={statsB.scoreLow} total={statsB.totalAds} color="#ef4444" />
                  </StatCard>

                  <StatCard label="Tipos de gancho mais comuns">
                    {topN(statsB.hookTypes, 5).length === 0 && <span style={{ fontSize: 12, color: "var(--text-3)" }}>Sem dados</span>}
                    {topN(statsB.hookTypes, 5).map(([type, count]) => (
                      <div key={type} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: "var(--text-2)" }}>{type}</span>
                        <span style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600 }}>{count} ({pct(count, statsB.totalAds)})</span>
                      </div>
                    ))}
                  </StatCard>

                  <StatCard label="Angulos mais comuns">
                    {topN(statsB.angles, 5).length === 0 && <span style={{ fontSize: 12, color: "var(--text-3)" }}>Sem dados</span>}
                    {topN(statsB.angles, 5).map(([angle, count]) => (
                      <div key={angle} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: "var(--text-2)" }}>{angle}</span>
                        <span style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600 }}>{count} ({pct(count, statsB.totalAds)})</span>
                      </div>
                    ))}
                  </StatCard>

                  <StatCard label="Formatos">
                    <div style={{ display: "flex", gap: 16 }}>
                      <div style={{ textAlign: "center", flex: 1 }}>
                        <Film size={16} style={{ color: "var(--text-3)", margin: "0 auto 4px" }} />
                        <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-1)" }}>{pct(statsB.formatVideo, statsB.totalAds)}</div>
                        <div style={{ fontSize: 11, color: "var(--text-3)" }}>Video</div>
                      </div>
                      <div style={{ textAlign: "center", flex: 1 }}>
                        <Image size={16} style={{ color: "var(--text-3)", margin: "0 auto 4px" }} />
                        <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-1)" }}>{pct(statsB.formatImage, statsB.totalAds)}</div>
                        <div style={{ fontSize: 11, color: "var(--text-3)" }}>Imagem</div>
                      </div>
                      <div style={{ textAlign: "center", flex: 1 }}>
                        <Layers size={16} style={{ color: "var(--text-3)", margin: "0 auto 4px" }} />
                        <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-1)" }}>{pct(statsB.formatCarousel, statsB.totalAds)}</div>
                        <div style={{ fontSize: 11, color: "var(--text-3)" }}>Carrossel</div>
                      </div>
                    </div>
                  </StatCard>

                  <StatCard label="Top 3 anuncios">
                    {statsB.topAds.length === 0 && <span style={{ fontSize: 12, color: "var(--text-3)" }}>Sem anuncios analisados</span>}
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {statsB.topAds.map(ad => <MiniAdCard key={ad.id} ad={ad} />)}
                    </div>
                  </StatCard>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
