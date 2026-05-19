import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Repeat2, Search, Copy, ExternalLink, Heart, Eye, Share2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { TikTokReadapted } from "./types";
import { formatCompactNumber, formatDate, isTikTokSchemaMissingError } from "./types";
import ReadaptacaoCard from "./ReadaptacaoCard";

function ScoreBar({ score }: { score: number | undefined | null }) {
  if (score == null) return <span style={{ color: "var(--text-3)", fontSize: 12 }}>--</span>;
  const level = score >= 8 ? "high" : score >= 6 ? "mid" : "low";
  const filled = Math.round(score / 2);
  return (
    <div className="score-bar">
      <div className="score-dots">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className={`score-dot ${i < filled ? `filled-${level}` : "empty"}`} />
        ))}
      </div>
      <span className={`score-num ${level}`}>{score}</span>
    </div>
  );
}

export default function Readaptados() {
  const [items, setItems] = useState<TikTokReadapted[]>([]);
  const [profiles, setProfiles] = useState<{ id: string; name: string; handle: string | null; avatar: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 25;

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [readResp, profResp] = await Promise.all([
          supabase
            .from("tiktok_readapted_posts")
            .select("*, tiktok_posts(caption, views, likes, shares, post_url, thumbnail_url)")
            .order("created_at", { ascending: false })
            .limit(200),
          supabase
            .from("tiktok_profiles")
            .select("id,name,handle,avatar")
            .order("name"),
        ]);
        if (readResp.error) throw readResp.error;
        setItems((readResp.data || []) as TikTokReadapted[]);
        if (profResp.data) setProfiles(profResp.data);
      } catch (error) {
        if (!isTikTokSchemaMissingError(error)) {
          toast.error(error instanceof Error ? error.message : "Erro ao buscar readaptados");
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const profileMap = Object.fromEntries(profiles.map((p) => [p.id, p]));

  const totalViews = items.reduce((s, i) => s + (i.visualizacoes || 0), 0);
  const totalLikes = items.reduce((s, i) => s + (i.curtidas || 0), 0);
  const avgScore = items.length > 0
    ? +(items.reduce((s, i) => s + (i.score_relevancia || 0), 0) / items.length).toFixed(1)
    : 0;

  const filtered = items.filter((item) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (item.tema || "").toLowerCase().includes(q) ||
      (item.gancho || "").toLowerCase().includes(q) ||
      (item.original_caption || "").toLowerCase().includes(q) ||
      (item.client_name || "").toLowerCase().includes(q)
    );
  });

  // Reset page on search change
  useEffect(() => { setCurrentPage(1); }, [search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginatedItems = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const pageHeader = (
    <div className="page-header">
      <div className="page-header-icon" style={{ background: "linear-gradient(135deg, #00f2ea, #ff0050)" }}>
        <Repeat2 className="w-[18px] h-[18px]" style={{ color: "#fff" }} />
      </div>
      <div>
        <h1 className="page-header-title">Readaptados TikTok</h1>
        <p className="page-header-sub">Posts readaptados com hooks magneticos e sugestoes de conteudo</p>
      </div>
    </div>
  );

  if (loading) {
    return <div className="page-content">{pageHeader}<div className="flex items-center justify-center py-16"><Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--text-3)" }} /></div></div>;
  }

  return (
    <div className="page-content">
      {pageHeader}
      {/* Stats row */}
      <div style={{ display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          { label: "Total", value: String(items.length) },
          { label: "Score medio", value: String(avgScore) },
          { label: "Views totais", value: formatCompactNumber(totalViews) },
          { label: "Likes totais", value: formatCompactNumber(totalLikes) },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.25 }}
            style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "12px 18px", flex: "1 1 140px" }}
          >
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)" }}>{s.value}</div>
            <div style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase" }}>{s.label}</div>
          </motion.div>
        ))}
      </div>

      {/* Search */}
      <div style={{ marginBottom: 20 }} className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: "var(--text-3)" }} />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por tema, gancho ou perfil..." className="pl-10 h-10 text-sm" style={{ background: "var(--surface)", color: "var(--text-1)", border: "1px solid var(--border)", borderRadius: "0.75rem" }} />
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <p className="text-[13px]" style={{ color: "var(--text-3)" }}>Nenhum post readaptado ainda.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {profiles.filter(p => filtered.some(it => it.profile_id === p.id)).map((profile) => {
            const profileItems = filtered.filter(it => it.profile_id === profile.id);
            return (
              <div key={profile.id}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, overflow: "hidden", background: "linear-gradient(135deg, #00f2ea, #ff0050)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                    {profile.avatar ? <img src={profile.avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : profile.name.charAt(0).toUpperCase()}
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-1)" }}>{profile.name}</span>
                  {profile.handle && <span style={{ fontSize: 12, color: "var(--text-3)" }}>@{profile.handle}</span>}
                  <span style={{ fontSize: 12, color: "var(--text-3)", marginLeft: "auto" }}>{profileItems.length} readaptados</span>
                </div>
                <div className="table-wrap">
                  <div className="overflow-x-auto">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Tema</th>
                          <th>Gancho</th>
                          <th>Score</th>
                          <th style={{ textAlign: "right" }}><Eye size={13} /></th>
                          <th style={{ textAlign: "right" }}><Heart size={13} /></th>
                          <th style={{ textAlign: "right" }}><Share2 size={13} /></th>
                          <th>Data</th>
                        </tr>
                      </thead>
                      <tbody>
                        {profileItems.map((item, i) => {
                          const isExpanded = expandedId === item.id;
                          const hooks = item.hooks_magneticos as Record<string, string[]> | null;
                          return (
                            <React.Fragment key={item.id}>
                              <tr
                                onClick={() => setExpandedId(isExpanded ? null : item.id)}
                                style={{ cursor: "pointer", background: isExpanded ? "var(--surface-hover)" : undefined }}
                              >
                                <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13 }}>{item.tema || "--"}</td>
                                <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12, color: "var(--text-2)" }}>{item.gancho || "--"}</td>
                                <td><ScoreBar score={item.score_relevancia} /></td>
                                <td style={{ textAlign: "right", fontSize: 12 }}>{formatCompactNumber(item.visualizacoes)}</td>
                                <td style={{ textAlign: "right", fontSize: 12 }}>{formatCompactNumber(item.curtidas)}</td>
                                <td style={{ textAlign: "right", fontSize: 12 }}>{formatCompactNumber(item.envios)}</td>
                                <td style={{ fontSize: 12, color: "var(--text-3)", whiteSpace: "nowrap" }}>{formatDate(item.created_at)}</td>
                              </tr>
                              {isExpanded && (
                                <tr>
                                  <td colSpan={7} style={{ padding: 0, border: "none" }}>
                                    <motion.div
                                      initial={{ opacity: 0, height: 0 }}
                                      animate={{ opacity: 1, height: "auto" }}
                                      transition={{ duration: 0.25 }}
                                      style={{ overflow: "hidden" }}
                                    >
                                      <div style={{ padding: "16px 20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, background: "rgba(255,255,255,0.02)", borderBottom: "1px solid var(--border)" }}>
                                        <div>
                                          <ReadaptacaoCard text={item.sugestao_readaptacao} />
                                          {item.original_post_url && (
                                            <a href={item.original_post_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "var(--accent)", display: "inline-flex", alignItems: "center", gap: 4, marginTop: 10 }}>
                                              <ExternalLink size={12} /> Ver no TikTok
                                            </a>
                                          )}
                                        </div>
                                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                          {hooks && Object.keys(hooks).length > 0 && (
                                            <div>
                                              <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", color: "var(--text-3)", marginBottom: 4 }}>Hooks magneticos</div>
                                              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                                {Object.entries(hooks).map(([cat, list]) => (
                                                  <div key={cat} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: 8 }}>
                                                    <span style={{ fontSize: 11, fontWeight: 600, color: "#00f2ea", textTransform: "capitalize" }}>{cat}</span>
                                                    <ul style={{ margin: "4px 0 0 14px", padding: 0 }}>
                                                      {(list || []).map((h, hi) => (
                                                        <li key={hi} style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.5 }}>{h}</li>
                                                      ))}
                                                    </ul>
                                                  </div>
                                                ))}
                                              </div>
                                            </div>
                                          )}
                                          {item.transcricao && (
                                            <div>
                                              <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", color: "var(--text-3)", marginBottom: 4 }}>Transcricao</div>
                                              <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.6, maxHeight: 180, overflowY: "auto", whiteSpace: "pre-wrap", background: "var(--surface)", borderRadius: 8, padding: 10, border: "1px solid var(--border)" }}>
                                                {item.transcricao}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </motion.div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {filtered.length > ITEMS_PER_PAGE && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 20 }}>
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            style={{
              padding: "6px 14px", borderRadius: 8, border: "1px solid var(--border)",
              background: currentPage === 1 ? "transparent" : "var(--surface)", color: "var(--text-2)",
              cursor: currentPage === 1 ? "default" : "pointer", fontSize: 13, opacity: currentPage === 1 ? 0.4 : 1,
              transition: "all 0.15s",
            }}
          >
            Anterior
          </button>
          <span style={{ fontSize: 13, color: "var(--text-3)", minWidth: 100, textAlign: "center" }}>
            {currentPage} de {totalPages} ({filtered.length} posts)
          </span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            style={{
              padding: "6px 14px", borderRadius: 8, border: "1px solid var(--border)",
              background: currentPage === totalPages ? "transparent" : "var(--surface)", color: "var(--text-2)",
              cursor: currentPage === totalPages ? "default" : "pointer", fontSize: 13, opacity: currentPage === totalPages ? 0.4 : 1,
              transition: "all 0.15s",
            }}
          >
            Proximo
          </button>
        </div>
      )}
    </div>
  );
}
