import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Search, Play, Loader2, Trash2, Pencil, Inbox } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { fetchBackend } from "@/lib/backendApi";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { AdCompetitor } from "./types";
import AddCompetitorDialog from "./AddCompetitorDialog";
import EditCompetitorDialog from "./EditCompetitorDialog";

export default function CompetitorList() {
  const [competitors, setCompetitors] = useState<AdCompetitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AdCompetitor | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdCompetitor | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [collectingId, setCollectingId] = useState<string | null>(null);
  const [collectTarget, setCollectTarget] = useState<AdCompetitor | null>(null);
  const [maxAds, setMaxAds] = useState("10");

  const fetchCompetitors = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("ad_competitors")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setCompetitors(data || []);
    } catch (err: any) {
      toast.error(err.message || "Erro ao buscar concorrentes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompetitors();
  }, []);

  const handleToggleActive = async (competitor: AdCompetitor) => {
    try {
      const { error } = await supabase
        .from("ad_competitors")
        .update({ is_active: !competitor.is_active })
        .eq("id", competitor.id);

      if (error) throw error;
      fetchCompetitors();
    } catch (err: any) {
      toast.error(err.message || "Erro ao atualizar status");
    }
  };

  const handleCollectConfirm = async () => {
    if (!collectTarget) return;
    const competitor = collectTarget;
    setCollectTarget(null);
    setCollectingId(competitor.id);
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

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || data.message || `HTTP ${response.status}`);
      }

      toast.success(`Coleta de ate ${maxAds} anuncios iniciada! Resultados em alguns minutos.`);
    } catch (err: any) {
      toast.error(`Erro ao iniciar coleta: ${err.message}`);
    } finally {
      setCollectingId(null);
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
      toast.success("Concorrente removido com sucesso!");
      setDeleteTarget(null);
      fetchCompetitors();
    } catch (err: any) {
      toast.error(err.message || "Erro ao remover concorrente");
    } finally {
      setDeleting(false);
    }
  };

  const filtered = competitors.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 20,
          flexWrap: "wrap",
        }}
      >
        <button
          className="btn-primary"
          onClick={() => setDialogOpen(true)}
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <Plus size={15} />
          Adicionar Concorrente
        </button>

        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
          }}
        >
          <Search
            size={14}
            style={{
              position: "absolute",
              left: 10,
              color: "var(--text-3)",
              pointerEvents: "none",
            }}
          />
          <input
            className="search-input"
            placeholder="Buscar concorrente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 30 }}
          />
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--text-3)" }} />
        </div>
      ) : competitors.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-16 gap-3"
          style={{ textAlign: "center" }}
        >
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ background: "var(--surface)" }}
          >
            <Inbox className="w-5 h-5" style={{ color: "var(--text-3)" }} />
          </div>
          <div>
            <p className="text-[14px] font-semibold" style={{ color: "var(--text-1)" }}>
              Nenhum concorrente cadastrado
            </p>
            <p className="text-[13px] mt-1" style={{ color: "var(--text-3)" }}>
              Adicione o primeiro concorrente para comecar o monitoramento.
            </p>
          </div>
        </div>
      ) : (
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            overflow: "hidden",
          }}
        >
          {/* Table header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr 1fr 80px 80px 80px",
              padding: "10px 16px",
              background: "var(--surface)",
              borderBottom: "1px solid var(--border)",
            }}
          >
            {["Nome", "Page ID", "Grupo", "Status", "Coletar", "Acoes"].map((col) => (
              <span
                key={col}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--text-3)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                {col}
              </span>
            ))}
          </div>

          {/* Table rows */}
          {filtered.map((competitor, index) => (
            <motion.div
              key={competitor.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: index * 0.03 }}
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1fr 1fr 80px 80px 80px",
                padding: "12px 16px",
                alignItems: "center",
                borderBottom: "1px solid var(--border)",
                opacity: competitor.is_active ? 1 : 0.5,
                background: "transparent",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "var(--surface)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
              }}
            >
              {/* Nome */}
              <div>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--text-1)",
                    display: "block",
                  }}
                >
                  {competitor.name}
                </span>
                {competitor.page_url && (
                  <a
                    href={competitor.page_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 12,
                      color: "var(--text-3)",
                      textDecoration: "none",
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {competitor.page_url.replace(/^https?:\/\//, "").substring(0, 40)}
                    {competitor.page_url.length > 50 ? "..." : ""}
                  </a>
                )}
              </div>

              {/* Page ID */}
              <span style={{ fontSize: 13, color: "var(--text-2)" }}>
                {competitor.page_id || <span style={{ color: "var(--text-3)" }}>—</span>}
              </span>

              {/* Grupo */}
              <span style={{ fontSize: 13, color: "var(--text-2)" }}>
                {competitor.grupo || <span style={{ color: "var(--text-3)" }}>—</span>}
              </span>

              {/* Status toggle */}
              <div>
                <Switch
                  checked={competitor.is_active}
                  onCheckedChange={() => handleToggleActive(competitor)}
                  aria-label={`Toggle ${competitor.name} active status`}
                />
              </div>

              {/* Coletar button */}
              <div>
                <button
                  onClick={() => { setCollectTarget(competitor); setMaxAds("50"); }}
                  disabled={!competitor.is_active || collectingId === competitor.id}
                  title="Coletar anuncios"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "5px 10px",
                    fontSize: 12,
                    fontWeight: 500,
                    color: "var(--text-2)",
                    background: "transparent",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    cursor: !competitor.is_active || collectingId === competitor.id ? "not-allowed" : "pointer",
                    opacity: !competitor.is_active || collectingId === competitor.id ? 0.5 : 1,
                    transition: "all 0.15s",
                  }}
                >
                  {collectingId === competitor.id ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Play size={13} />
                  )}
                </button>
              </div>

              {/* Acoes */}
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <button
                  onClick={() => setEditTarget(competitor)}
                  className="icon-btn"
                  title="Editar"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={() => setDeleteTarget(competitor)}
                  className="icon-btn"
                  title="Remover"
                  style={{ color: "var(--cr-red)" }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </motion.div>
          ))}

          {/* No search results */}
          {filtered.length === 0 && competitors.length > 0 && (
            <div
              className="flex items-center justify-center py-10"
              style={{ color: "var(--text-3)", fontSize: 13 }}
            >
              Nenhum concorrente encontrado para "{search}"
            </div>
          )}
        </div>
      )}

      {/* Dialogs */}
      <AddCompetitorDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={fetchCompetitors}
      />

      <EditCompetitorDialog
        competitor={editTarget}
        open={!!editTarget}
        onOpenChange={(open) => !open && setEditTarget(null)}
        onUpdated={fetchCompetitors}
      />

      {/* Collect dialog */}
      <AlertDialog
        open={!!collectTarget}
        onOpenChange={(open) => !open && setCollectTarget(null)}
      >
        <AlertDialogContent
          style={{
            background: "var(--dialog-bg)",
            border: "1px solid var(--border)",
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle style={{ color: "var(--text-1)" }}>
              Coletar anuncios
            </AlertDialogTitle>
            <AlertDialogDescription style={{ color: "var(--text-2)" }}>
              Quantos anuncios deseja coletar de{" "}
              <strong style={{ color: "var(--text-1)" }}>{collectTarget?.name}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div style={{ padding: "8px 0 16px" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
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
                    transition: "all 0.15s",
                  }}
                >
                  {n}
                </button>
              ))}
              <input
                type="number"
                value={maxAds}
                onChange={(e) => setMaxAds(e.target.value)}
                onBlur={() => {
                  const v = parseInt(maxAds);
                  if (isNaN(v) || v < 10) setMaxAds("10");
                }}
                min={10}
                max={500}
                style={{
                  width: 70,
                  height: 34,
                  padding: "0 8px",
                  fontSize: 13,
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  color: "var(--text-1)",
                  textAlign: "center",
                }}
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel
              style={{
                border: "1px solid var(--border)",
                color: "var(--text-2)",
                background: "transparent",
              }}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCollectConfirm}
              style={{ background: "var(--cr-grad)", color: "#fff" }}
            >
              Iniciar coleta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete dialog */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent
          style={{
            background: "var(--dialog-bg)",
            border: "1px solid var(--border)",
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle style={{ color: "var(--text-1)" }}>
              Remover concorrente?
            </AlertDialogTitle>
            <AlertDialogDescription style={{ color: "var(--text-2)" }}>
              Todos os anuncios coletados de{" "}
              <strong style={{ color: "var(--text-1)" }}>{deleteTarget?.name}</strong>{" "}
              serao removidos permanentemente. Esta acao nao pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              style={{
                border: "1px solid var(--border)",
                color: "var(--text-2)",
                background: "transparent",
              }}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              style={{ background: "var(--cr-red)", color: "#fff" }}
            >
              {deleting ? "Removendo..." : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
