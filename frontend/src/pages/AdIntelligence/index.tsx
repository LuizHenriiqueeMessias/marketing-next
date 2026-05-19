import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { TrendingUp, Plus, Search, Loader2, MoreVertical, Pencil, Trash2, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { fetchBackend, pingBackend } from "@/lib/backendApi";
import type { AdCompetitor } from "./types";

interface CompetitorWithCount extends AdCompetitor {
  ad_count: number;
}

export default function AdIntelligence() {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const [competitors, setCompetitors] = useState<CompetitorWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Add competitor dialog
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addPageId, setAddPageId] = useState("");
  const [addGrupo, setAddGrupo] = useState("");
  const [adding, setAdding] = useState(false);

  // Collect dialog
  const [collectTarget, setCollectTarget] = useState<CompetitorWithCount | null>(null);
  const [maxAds, setMaxAds] = useState("10");
  const [collectingId, setCollectingId] = useState<string | null>(null);

  // Edit dialog
  const [editTarget, setEditTarget] = useState<CompetitorWithCount | null>(null);
  const [editName, setEditName] = useState("");
  const [editGrupo, setEditGrupo] = useState("");

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<CompetitorWithCount | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Menu
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  const fetchCompetitors = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("ad_competitors")
        .select("*")
        .order("created_at", { ascending: false });

      // Non-admin: only see own competitors
      if (role !== "admin" && user?.id) {
        query = query.eq("user_id", user.id);
      }

      const { data: comps, error } = await query;
      if (error) throw error;

      // Get ad counts per competitor
      const { data: counts } = await supabase
        .from("ad_creatives")
        .select("competitor_id");

      const countMap: Record<string, number> = {};
      (counts || []).forEach((c: any) => {
        countMap[c.competitor_id] = (countMap[c.competitor_id] || 0) + 1;
      });

      setCompetitors(
        (comps || []).map((c: AdCompetitor) => ({
          ...c,
          ad_count: countMap[c.id] || 0,
        }))
      );
    } catch (err: any) {
      toast.error("Erro ao carregar concorrentes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCompetitors(); }, []);

  // Keep-alive: ping backend to prevent cold start
  useEffect(() => {
    pingBackend();
    const interval = setInterval(() => {
      pingBackend();
    }, 4 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const handleAdd = async () => {
    if (!addName.trim() || !addPageId.trim()) return;
    setAdding(true);
    try {
      const { error } = await supabase.from("ad_competitors").insert({
        name: addName.trim(),
        page_id: addPageId.trim(),
        grupo: addGrupo.trim() || null,
        user_id: user?.id,
      });
      if (error) throw error;
      toast.success("Concorrente adicionado!");
      setShowAdd(false);
      setAddName("");
      setAddPageId("");
      setAddGrupo("");
      fetchCompetitors();
    } catch (err: any) {
      toast.error(err.message || "Erro ao adicionar");
    } finally {
      setAdding(false);
    }
  };

  const handleCollect = async () => {
    if (!collectTarget) return;
    const competitor = collectTarget;
    setCollectTarget(null);
    setCollectingId(competitor.id);

    // Show coldstart warning after 3s
    const coldstartTimer = setTimeout(() => {
      toast.info("Servidor iniciando... isso pode levar alguns segundos na primeira requisicao.", { duration: 8000 });
    }, 3000);

    try {
      const response = await fetchBackend("/ad-intelligence/collect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          competitor_id: competitor.id,
          page_id: competitor.page_id,
          max_ads: Math.max(parseInt(maxAds) || 10, 10),
        }),
      });
      clearTimeout(coldstartTimer);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || data.message || `HTTP ${response.status}`);
      }
      toast.success(`Coleta de ate ${maxAds} anuncios iniciada!`);
    } catch (err: any) {
      clearTimeout(coldstartTimer);
      toast.error(`Erro ao iniciar coleta: ${err.message}`);
    } finally {
      setCollectingId(null);
    }
  };

  const handleEdit = async () => {
    if (!editTarget || !editName.trim()) return;
    try {
      const { error } = await supabase
        .from("ad_competitors")
        .update({ name: editName.trim(), grupo: editGrupo.trim() || null })
        .eq("id", editTarget.id);
      if (error) throw error;
      toast.success("Concorrente atualizado!");
      setEditTarget(null);
      fetchCompetitors();
    } catch (err: any) {
      toast.error(err.message || "Erro ao atualizar");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from("ad_competitors")
        .delete()
        .eq("id", deleteTarget.id);
      if (error) throw error;
      toast.success("Concorrente removido!");
      setDeleteTarget(null);
      fetchCompetitors();
    } catch (err: any) {
      toast.error(err.message || "Erro ao remover");
    } finally {
      setDeleting(false);
    }
  };

  const filtered = competitors.filter(
    (c) => c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="page-header">
        <div className="page-header-icon">
          <TrendingUp className="w-[18px] h-[18px]" style={{ color: "var(--accent)" }} />
        </div>
        <div style={{ flex: 1 }}>
          <h1 className="page-header-title" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700 }}>Ad Intelligence</h1>
          <p className="page-header-sub">Monitore criativos de concorrentes do Facebook Ad Library</p>
        </div>
      </div>

      <div className="page-content">
        {/* Toolbar */}
        <motion.div
          style={{ display: "flex", gap: 12, marginBottom: 24, alignItems: "center" }}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          <div style={{ position: "relative", flex: 1, maxWidth: 320 }}>
            <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-3)" }} />
            <input
              type="text"
              placeholder="Buscar concorrente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                height: 38,
                paddingLeft: 34,
                paddingRight: 12,
                fontSize: 13,
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                color: "var(--text-1)",
              }}
            />
          </div>
          <button
            onClick={() => setShowAdd(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "var(--cr-grad)",
              color: "white",
              border: "none",
              borderRadius: "var(--radius-md)",
              padding: "0 16px",
              height: 38,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <Plus size={14} />
            Novo Concorrente
          </button>
        </motion.div>

        {/* Loading */}
        {loading && (
          <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
            <Loader2 size={24} className="animate-spin" style={{ color: "var(--text-3)" }} />
          </div>
        )}

        {/* Empty state */}
        {!loading && competitors.length === 0 && (
          <div style={{ textAlign: "center", padding: "64px 0", color: "var(--text-3)" }}>
            <TrendingUp size={40} style={{ margin: "0 auto 16px", opacity: 0.3 }} />
            <p style={{ fontSize: 14 }}>Nenhum concorrente monitorado.</p>
            <p style={{ fontSize: 13 }}>Adicione um concorrente para comecar a coletar anuncios.</p>
          </div>
        )}

        {/* Competitor cards grid */}
        {!loading && filtered.length > 0 && (
          <motion.div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
              gap: 16,
            }}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            {filtered.map((comp, index) => (
              <motion.div
                key={comp.id}
                onClick={() => navigate(`/ad-intelligence/competitor/${comp.id}`)}
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-lg)",
                  padding: 20,
                  cursor: "pointer",
                  transition: "all 0.15s",
                  position: "relative",
                  opacity: comp.is_active ? 1 : 0.5,
                }}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: comp.is_active ? 1 : 0.5, y: 0 }}
                transition={{ duration: 0.24, delay: index * 0.04, ease: [0.22, 1, 0.36, 1] }}
                whileHover={{ y: -4, scale: 1.01 }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
              >
                {/* Header: name + menu */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div>
                    <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-1)", margin: 0 }}>
                      {comp.name}
                    </h3>
                    {comp.grupo && (
                      <span style={{ fontSize: 11, color: "var(--text-3)" }}>{comp.grupo}</span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    {/* Menu button */}
                    <div style={{ position: "relative" }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === comp.id ? null : comp.id); }}
                        style={{
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          padding: 4,
                          borderRadius: "var(--radius)",
                          color: "var(--text-3)",
                        }}
                      >
                        <MoreVertical size={16} />
                      </button>
                      {menuOpen === comp.id && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            position: "absolute",
                            right: 0,
                            top: "100%",
                            background: "var(--bg)",
                            border: "1px solid var(--border)",
                            borderRadius: "var(--radius-md)",
                            padding: 4,
                            zIndex: 20,
                            minWidth: 140,
                            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                          }}
                        >
                          <button
                            onClick={() => { setEditTarget(comp); setEditName(comp.name); setEditGrupo(comp.grupo || ""); setMenuOpen(null); }}
                            style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: "transparent", border: "none", padding: "8px 12px", cursor: "pointer", color: "var(--text-2)", fontSize: 13, borderRadius: "var(--radius)" }}
                          >
                            <Pencil size={13} /> Editar
                          </button>
                          <button
                            onClick={() => { setDeleteTarget(comp); setMenuOpen(null); }}
                            style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: "transparent", border: "none", padding: "8px 12px", cursor: "pointer", color: "var(--danger, #ef4444)", fontSize: 13, borderRadius: "var(--radius)" }}
                          >
                            <Trash2 size={13} /> Excluir
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Stats row */}
                <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
                  <div>
                    <span style={{ fontSize: 22, fontWeight: 700, color: "var(--text-1)" }}>{comp.ad_count}</span>
                    <span style={{ fontSize: 11, color: "var(--text-3)", marginLeft: 4 }}>anuncios</span>
                  </div>
                  {comp.last_collected_at && (
                    <div style={{ fontSize: 11, color: "var(--text-3)", alignSelf: "flex-end" }}>
                      Coletado: {new Date(comp.last_collected_at).toLocaleDateString("pt-BR")}
                    </div>
                  )}
                </div>

                {/* Actions row */}
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); setCollectTarget(comp); setMaxAds("10"); }}
                    disabled={!comp.is_active || collectingId === comp.id}
                    style={{
                      background: "var(--cr-grad)",
                      color: "white",
                      border: "none",
                      borderRadius: "var(--radius)",
                      padding: "6px 14px",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: !comp.is_active || collectingId === comp.id ? "not-allowed" : "pointer",
                      opacity: !comp.is_active || collectingId === comp.id ? 0.5 : 1,
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    {collectingId === comp.id ? <Loader2 size={12} className="animate-spin" /> : null}
                    Coletar
                  </button>
                  <div style={{ flex: 1 }} />
                  <ChevronRight size={16} style={{ color: "var(--text-3)" }} />
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      {/* ── Add Dialog ── */}
      {showAdd && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={() => setShowAdd(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 24, width: 400, maxWidth: "90vw" }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-1)", marginBottom: 16 }}>Novo Concorrente</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input placeholder="Nome" value={addName} onChange={(e) => setAddName(e.target.value)} style={{ height: 38, padding: "0 12px", fontSize: 13, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", color: "var(--text-1)" }} />
              <input placeholder="Page ID (Facebook)" value={addPageId} onChange={(e) => setAddPageId(e.target.value)} style={{ height: 38, padding: "0 12px", fontSize: 13, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", color: "var(--text-1)" }} />
              <input placeholder="Grupo (opcional)" value={addGrupo} onChange={(e) => setAddGrupo(e.target.value)} style={{ height: 38, padding: "0 12px", fontSize: 13, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", color: "var(--text-1)" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button onClick={() => setShowAdd(false)} style={{ padding: "8px 16px", fontSize: 13, background: "transparent", color: "var(--text-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", cursor: "pointer" }}>Cancelar</button>
              <button onClick={handleAdd} disabled={adding || !addName.trim() || !addPageId.trim()} style={{ padding: "8px 16px", fontSize: 13, background: "var(--cr-grad)", color: "white", border: "none", borderRadius: "var(--radius-md)", cursor: "pointer", fontWeight: 600, opacity: adding ? 0.5 : 1 }}>
                {adding ? "Adicionando..." : "Adicionar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Collect Dialog ── */}
      {collectTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={() => setCollectTarget(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 24, width: 400, maxWidth: "90vw" }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-1)", marginBottom: 4 }}>Coletar anuncios</h3>
            <p style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 16 }}>Quantos anuncios deseja coletar de <strong style={{ color: "var(--text-1)" }}>{collectTarget.name}</strong>?</p>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
              {[10, 25, 50, 100].map((n) => (
                <button
                  key={n}
                  onClick={() => setMaxAds(String(n))}
                  style={{
                    padding: "6px 14px",
                    fontSize: 13,
                    fontWeight: 600,
                    borderRadius: "var(--radius)",
                    border: maxAds === String(n) ? "none" : "1px solid var(--border)",
                    background: maxAds === String(n) ? "var(--cr-grad)" : "transparent",
                    color: maxAds === String(n) ? "white" : "var(--text-2)",
                    cursor: "pointer",
                  }}
                >
                  {n}
                </button>
              ))}
              <input
                type="number"
                value={maxAds}
                onChange={(e) => setMaxAds(e.target.value)}
                onBlur={() => { const v = parseInt(maxAds); if (isNaN(v) || v < 10) setMaxAds("10"); }}
                min={10}
                max={500}
                style={{ width: 70, height: 34, padding: "0 8px", fontSize: 13, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", color: "var(--text-1)", textAlign: "center" }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setCollectTarget(null)} style={{ padding: "8px 16px", fontSize: 13, background: "transparent", color: "var(--text-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", cursor: "pointer" }}>Cancelar</button>
              <button onClick={handleCollect} style={{ padding: "8px 16px", fontSize: 13, background: "var(--cr-grad)", color: "white", border: "none", borderRadius: "var(--radius-md)", cursor: "pointer", fontWeight: 600 }}>Iniciar coleta</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Dialog ── */}
      {editTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={() => setEditTarget(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 24, width: 400, maxWidth: "90vw" }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-1)", marginBottom: 16 }}>Editar Concorrente</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input value={editName} onChange={(e) => setEditName(e.target.value)} style={{ height: 38, padding: "0 12px", fontSize: 13, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", color: "var(--text-1)" }} />
              <input placeholder="Grupo" value={editGrupo} onChange={(e) => setEditGrupo(e.target.value)} style={{ height: 38, padding: "0 12px", fontSize: 13, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", color: "var(--text-1)" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button onClick={() => setEditTarget(null)} style={{ padding: "8px 16px", fontSize: 13, background: "transparent", color: "var(--text-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", cursor: "pointer" }}>Cancelar</button>
              <button onClick={handleEdit} style={{ padding: "8px 16px", fontSize: 13, background: "var(--cr-grad)", color: "white", border: "none", borderRadius: "var(--radius-md)", cursor: "pointer", fontWeight: 600 }}>Salvar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Dialog ── */}
      {deleteTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={() => setDeleteTarget(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 24, width: 400, maxWidth: "90vw" }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-1)", marginBottom: 8 }}>Excluir Concorrente</h3>
            <p style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 16 }}>Tem certeza que deseja excluir <strong>{deleteTarget.name}</strong>? Os anuncios coletados tambem serao removidos.</p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setDeleteTarget(null)} style={{ padding: "8px 16px", fontSize: 13, background: "transparent", color: "var(--text-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", cursor: "pointer" }}>Cancelar</button>
              <button onClick={handleDelete} disabled={deleting} style={{ padding: "8px 16px", fontSize: 13, background: "var(--danger, #ef4444)", color: "white", border: "none", borderRadius: "var(--radius-md)", cursor: "pointer", fontWeight: 600, opacity: deleting ? 0.5 : 1 }}>
                {deleting ? "Excluindo..." : "Excluir"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
