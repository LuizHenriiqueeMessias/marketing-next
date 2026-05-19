import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { LayoutList, Loader2, Search, ExternalLink, Eye, Heart, MessageCircle, Share2, Bookmark, Music } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { TikTokPost, TikTokProfile } from "./types";
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

export default function Conteudos() {
  const [posts, setPosts] = useState<TikTokPost[]>([]);
  const [profiles, setProfiles] = useState<TikTokProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [profileFilter, setProfileFilter] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 25;

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [postsResp, profilesResp] = await Promise.all([
          supabase.from("tiktok_posts").select("*").order("created_at", { ascending: false }).limit(200),
          supabase.from("tiktok_profiles").select("id,name,handle,avatar").order("name"),
        ]);
        if (postsResp.error) throw postsResp.error;
        if (profilesResp.error) throw profilesResp.error;
        setPosts((postsResp.data || []) as TikTokPost[]);
        setProfiles((profilesResp.data || []) as TikTokProfile[]);
      } catch (error) {
        if (!isTikTokSchemaMissingError(error)) {
          toast.error(error instanceof Error ? error.message : "Erro ao buscar posts");
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const profileMap = Object.fromEntries(profiles.map((p) => [p.id, p]));

  const filtered = posts.filter((post) => {
    if (profileFilter && post.profile_id !== profileFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const caption = (post.caption || "").toLowerCase();
      const analysis = post.analysis as Record<string, unknown> | null;
      const tema = String(analysis?.tema || "").toLowerCase();
      if (!caption.includes(q) && !tema.includes(q)) return false;
    }
    return true;
  });

  // Reset page on filter change
  useEffect(() => { setCurrentPage(1); }, [search, profileFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginatedPosts = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const pageHeader = (
    <div className="page-header">
      <div className="page-header-icon" style={{ background: "linear-gradient(135deg, #00f2ea, #ff0050)" }}>
        <LayoutList className="w-[18px] h-[18px]" style={{ color: "#fff" }} />
      </div>
      <div>
        <h1 className="page-header-title">Conteúdos TikTok</h1>
        <p className="page-header-sub">Todos os posts coletados de todas as fontes TikTok</p>
      </div>
    </div>
  );

  if (loading) {
    return <div className="page-content">{pageHeader}<div className="flex items-center justify-center py-16"><Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--text-3)" }} /></div></div>;
  }

  return (
    <div className="page-content">
      {pageHeader}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <div className="relative" style={{ flex: 1, minWidth: 200 }}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: "var(--text-3)" }} />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por caption ou tema..." className="pl-10 h-10 text-sm" style={{ background: "var(--surface)", color: "var(--text-1)", border: "1px solid var(--border)", borderRadius: "0.75rem" }} />
        </div>
        <select
          value={profileFilter || ""}
          onChange={(e) => setProfileFilter(e.target.value || null)}
          className="input"
          style={{ background: "var(--surface)", color: "var(--text-1)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "8px 12px", fontSize: 13, minWidth: 180 }}
        >
          <option value="">Todos os perfis</option>
          {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div style={{ fontSize: 12, color: "var(--text-3)" }}>{filtered.length} posts</div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <p className="text-[13px]" style={{ color: "var(--text-3)" }}>Nenhum post encontrado.</p>
        </div>
      ) : profileFilter ? (
        /* Single profile selected — flat table */
        <div className="table-wrap">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Perfil</th>
                  <th>Caption</th>
                  <th>Tema</th>
                  <th>Score</th>
                  <th style={{ textAlign: "right" }}><Eye size={13} /></th>
                  <th style={{ textAlign: "right" }}><Heart size={13} /></th>
                  <th style={{ textAlign: "right" }}><Share2 size={13} /></th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {paginatedPosts.map((post, i) => {
                  const analysis = post.analysis as Record<string, unknown> | null;
                  const tema = String(analysis?.tema || "--");
                  const score = analysis?.score_relevancia as number | undefined;
                  const profile = post.profile_id ? profileMap[post.profile_id] : null;
                  const isExpanded = expandedId === post.id;

                  const gancho = String(analysis?.gancho || "");
                  const sugestao = String(analysis?.sugestao_readaptacao || "");
                  const transcricao = post.transcricao_formatada || post.transcricao || "";

                  return (
                    <React.Fragment key={post.id}>
                      <motion.tr
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.04, duration: 0.2 }}
                        onClick={() => setExpandedId(isExpanded ? null : post.id)}
                        style={{ cursor: "pointer", background: isExpanded ? "var(--surface-hover)" : undefined }}
                      >
                        <td style={{ fontSize: 12 }}>{profile?.name || "--"}</td>
                        <td style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13 }}>{post.caption || "--"}</td>
                        <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12, color: "var(--text-2)" }}>{tema}</td>
                        <td><ScoreBar score={score} /></td>
                        <td style={{ textAlign: "right", fontSize: 12 }}>{formatCompactNumber(post.views)}</td>
                        <td style={{ textAlign: "right", fontSize: 12 }}>{formatCompactNumber(post.likes)}</td>
                        <td style={{ textAlign: "right", fontSize: 12 }}>{formatCompactNumber(post.shares)}</td>
                        <td style={{ fontSize: 12, color: "var(--text-3)", whiteSpace: "nowrap" }}>{formatDate(post.created_at)}</td>
                      </motion.tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={8} style={{ padding: 0, border: "none" }}>
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              transition={{ duration: 0.25 }}
                              style={{ overflow: "hidden" }}
                            >
                              <div style={{ padding: "16px 20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, background: "rgba(255,255,255,0.02)", borderBottom: "1px solid var(--border)" }}>
                                {/* Left — info + transcricao */}
                                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                  {tema !== "--" && (
                                    <div>
                                      <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", color: "var(--text-3)", marginBottom: 4 }}>Tema</div>
                                      <div style={{ fontSize: 13, color: "var(--text-1)", lineHeight: 1.5 }}>{tema}</div>
                                    </div>
                                  )}
                                  {gancho && (
                                    <div>
                                      <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", color: "var(--text-3)", marginBottom: 4 }}>Gancho</div>
                                      <div style={{ fontSize: 13, color: "var(--text-1)", lineHeight: 1.5, fontStyle: "italic" }}>"{gancho}"</div>
                                    </div>
                                  )}
                                  {transcricao && (
                                    <div>
                                      <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", color: "var(--text-3)", marginBottom: 4 }}>Transcricao</div>
                                      <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.6, maxHeight: 180, overflowY: "auto", whiteSpace: "pre-wrap", background: "var(--surface)", borderRadius: 8, padding: 10, border: "1px solid var(--border)" }}>
                                        {transcricao}
                                      </div>
                                    </div>
                                  )}
                                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                                    {post.post_url && (
                                      <a href={post.post_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "var(--accent)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                                        <ExternalLink size={12} /> Ver no TikTok
                                      </a>
                                    )}
                                    {post.music_name && (
                                      <span style={{ fontSize: 11, color: "var(--text-3)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                                        <Music size={11} /> {post.music_name}
                                      </span>
                                    )}
                                  </div>
                                  {post.hashtags && post.hashtags.length > 0 && (
                                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                      {post.hashtags.map((tag, ti) => (
                                        <span key={ti} style={{ fontSize: 11, color: "#00f2ea", background: "rgba(0,242,234,0.08)", padding: "2px 8px", borderRadius: 6 }}>#{tag}</span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                {/* Right — readaptacao formatada */}
                                <div>
                                  <ReadaptacaoCard text={sugestao} />
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
      ) : (
        /* No filter — group by profile */
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {profiles.filter(p => filtered.some(post => post.profile_id === p.id)).map((profile) => {
            const profilePosts = filtered.filter(post => post.profile_id === profile.id);
            return (
              <div key={profile.id}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  {(profile as any).avatar ? (
                    <img src={(profile as any).avatar} alt="" style={{ width: 32, height: 32, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 32, height: 32, borderRadius: 10, background: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                      {profile.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-1)" }}>{profile.name}</span>
                  <span style={{ fontSize: 12, color: "var(--text-3)" }}>{profile.handle ? `@${profile.handle}` : ""}</span>
                  <span style={{ fontSize: 12, color: "var(--text-3)", marginLeft: "auto" }}>{profilePosts.length} posts</span>
                </div>
                <div className="table-wrap">
                  <div className="overflow-x-auto">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Caption</th>
                          <th>Tema</th>
                          <th>Score</th>
                          <th style={{ textAlign: "right" }}><Eye size={13} /></th>
                          <th style={{ textAlign: "right" }}><Heart size={13} /></th>
                          <th style={{ textAlign: "right" }}><Share2 size={13} /></th>
                          <th>Data</th>
                        </tr>
                      </thead>
                      <tbody>
                        {profilePosts.map((post, i) => {
                          const analysis = post.analysis as Record<string, unknown> | null;
                          const tema = String(analysis?.tema || "--");
                          const score = analysis?.score_relevancia as number | undefined;
                          const gancho = String(analysis?.gancho || "");
                          const sugestao = String(analysis?.sugestao_readaptacao || "");
                          const transcricao = post.transcricao_formatada || post.transcricao || "";
                          const isExpanded = expandedId === post.id;

                          return (
                            <React.Fragment key={post.id}>
                              <tr
                                onClick={() => setExpandedId(isExpanded ? null : post.id)}
                                style={{ cursor: "pointer", background: isExpanded ? "var(--surface-hover)" : undefined }}
                              >
                                <td style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13 }}>{post.caption || "--"}</td>
                                <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12, color: "var(--text-2)" }}>{tema}</td>
                                <td><ScoreBar score={score} /></td>
                                <td style={{ textAlign: "right", fontSize: 12 }}>{formatCompactNumber(post.views)}</td>
                                <td style={{ textAlign: "right", fontSize: 12 }}>{formatCompactNumber(post.likes)}</td>
                                <td style={{ textAlign: "right", fontSize: 12 }}>{formatCompactNumber(post.shares)}</td>
                                <td style={{ fontSize: 12, color: "var(--text-3)", whiteSpace: "nowrap" }}>{formatDate(post.created_at)}</td>
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
                                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                          {tema !== "--" && (
                                            <div>
                                              <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", color: "var(--text-3)", marginBottom: 4 }}>Tema</div>
                                              <div style={{ fontSize: 13, color: "var(--text-1)", lineHeight: 1.5 }}>{tema}</div>
                                            </div>
                                          )}
                                          {gancho && (
                                            <div>
                                              <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", color: "var(--text-3)", marginBottom: 4 }}>Gancho</div>
                                              <div style={{ fontSize: 13, color: "var(--text-1)", lineHeight: 1.5, fontStyle: "italic" }}>"{gancho}"</div>
                                            </div>
                                          )}
                                          {transcricao && (
                                            <div>
                                              <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", color: "var(--text-3)", marginBottom: 4 }}>Transcricao</div>
                                              <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.6, maxHeight: 180, overflowY: "auto", whiteSpace: "pre-wrap", background: "var(--surface)", borderRadius: 8, padding: 10, border: "1px solid var(--border)" }}>{transcricao}</div>
                                            </div>
                                          )}
                                          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                                            {post.post_url && <a href={post.post_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "var(--accent)", display: "inline-flex", alignItems: "center", gap: 4 }}><ExternalLink size={12} /> Ver no TikTok</a>}
                                            {post.music_name && <span style={{ fontSize: 11, color: "var(--text-3)", display: "inline-flex", alignItems: "center", gap: 4 }}><Music size={11} /> {post.music_name}</span>}
                                          </div>
                                          {post.hashtags && post.hashtags.length > 0 && (
                                            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                              {post.hashtags.map((tag, ti) => <span key={ti} style={{ fontSize: 11, color: "#00f2ea", background: "rgba(0,242,234,0.08)", padding: "2px 8px", borderRadius: 6 }}>#{tag}</span>)}
                                            </div>
                                          )}
                                        </div>
                                        <div><ReadaptacaoCard text={sugestao} /></div>
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
