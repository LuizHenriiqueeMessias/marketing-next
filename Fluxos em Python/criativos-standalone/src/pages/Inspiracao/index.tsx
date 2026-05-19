import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Sparkles, Loader2, RotateCcw, CheckCircle2, Inbox, Trash2, Video, Image, LayoutGrid } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
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
import ProfileList from "./ProfileList";
import PostsTable from "./PostsTable";
import type { InspirationProfile, InspirationPost } from "./types";
import { useToolLogger } from "@/hooks/useToolLogger";

function getMediaBadgeStyle(type: string | null) {
  const t = (type || "").toLowerCase();
  if (t === "video" || t === "reel") {
    return { bg: "var(--cr-badge-video-bg)", color: "var(--cr-badge-video-color)", border: "var(--cr-badge-video-border)", icon: Video, label: type || "post" };
  }
  if (t === "carousel" || t === "sidecar") {
    return { bg: "var(--cr-badge-carousel-bg)", color: "var(--cr-badge-carousel-color)", border: "var(--cr-badge-carousel-border)", icon: LayoutGrid, label: "Carrossel" };
  }
  return { bg: "var(--cr-badge-image-bg)", color: "var(--cr-badge-image-color)", border: "var(--cr-badge-image-border)", icon: Image, label: type || "post" };
}

// ─── Descartados list ────────────────────────────────────────────────────────

function DescartadosList({ profileId }: { profileId: string }) {
  const { log } = useToolLogger();
  const [posts, setPosts] = useState<InspirationPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [deletingPost, setDeletingPost] = useState<InspirationPost | null>(null);

  const fetchPosts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("inspiration_posts")
        .select("*")
        .eq("profile_id", profileId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      const all: InspirationPost[] = data || [];
      const descartados = all.filter((p) => {
        const a =
          typeof p.analysis === "string"
            ? (() => { try { return JSON.parse(p.analysis); } catch { return null; } })()
            : p.analysis;
        return a?.descartar === true;
      });
      setPosts(descartados);
    } catch (err: any) {
      toast.error(err.message || "Erro ao buscar posts descartados");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPosts();
  }, [profileId]);

  const handleRecuperar = async (post: InspirationPost) => {
    try {
      const analysis =
        typeof post.analysis === "string"
          ? (() => { try { return JSON.parse(post.analysis); } catch { return null; } })()
          : post.analysis;

      const newAnalysis = { ...analysis };
      newAnalysis.descartar = false;
      delete newAnalysis.motivo_descarte;

      const { error } = await supabase
        .from("inspiration_posts")
        .update({ analysis: newAnalysis })
        .eq("id", post.id);

      if (error) throw error;

      toast.success("Post recuperado!");
      log({ toolId: "criativos-inspiracao", actionType: "record_update", actionDetail: `Recuperou post descartado (${(post.caption || "").slice(0, 50)}...)`, metadata: { postId: post.id } });
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
    } catch (err: any) {
      toast.error(err.message || "Erro ao recuperar post");
    }
  };

  const handleDeletePost = async () => {
    if (!deletingPost) return;
    try {
      const { error } = await supabase
        .from("inspiration_posts")
        .delete()
        .eq("id", deletingPost.id);
      if (error) throw error;
      setPosts((prev) => prev.filter((p) => p.id !== deletingPost.id));
      selectedIds.delete(deletingPost.id);
      setSelectedIds(new Set(selectedIds));
      toast.success("Post excluido");
      log({ toolId: "criativos-inspiracao", actionType: "record_delete", actionDetail: `Excluiu post descartado (${(deletingPost.caption || "").slice(0, 50)}...)`, metadata: { postId: deletingPost.id } });
      setDeletingPost(null);
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir post");
    }
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    try {
      const { error } = await supabase
        .from("inspiration_posts")
        .delete()
        .in("id", ids);
      if (error) throw error;
      setPosts((prev) => prev.filter((p) => !selectedIds.has(p.id)));
      toast.success(`${ids.length} post(s) excluido(s)`);
      log({ toolId: "criativos-inspiracao", actionType: "bulk_action", actionDetail: `Excluiu ${ids.length} post(s) descartado(s) em massa`, metadata: { count: ids.length, postIds: ids } });
      setSelectedIds(new Set());
      setBulkDeleting(false);
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir posts");
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const f = "var(--cr-font)";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--cr-text-3)" }} />
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: "var(--cr-surface)" }}
        >
          <RotateCcw className="w-4 h-4" style={{ color: "var(--cr-text-3)" }} />
        </div>
        <p style={{ color: "var(--cr-text-3)", fontFamily: f, fontSize: "13px" }}>
          Nenhum post descartado encontrado.
        </p>
      </div>
    );
  }

  return (
    <>
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: "1px solid var(--cr-border)", fontFamily: f }}
    >
      {selectedIds.size > 0 && (
        <div
          className="flex items-center justify-between px-4 py-2"
          style={{ background: "var(--cr-surface)", borderBottom: "1px solid var(--cr-border)" }}
        >
          <span className="text-[13px] font-medium" style={{ color: "var(--cr-text-2)" }}>
            {selectedIds.size} selecionado(s)
          </span>
          <Button
            size="sm"
            className="gap-1.5 text-xs h-7"
            style={{ background: "var(--cr-red)", color: "#fff", fontFamily: f }}
            onClick={() => setBulkDeleting(true)}
          >
            <Trash2 className="w-3 h-3" />
            Excluir selecionados
          </Button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--cr-border)", background: "var(--cr-surface)" }}>
              <th className="w-10 px-3 py-3">
                <Checkbox
                  checked={posts.length > 0 && selectedIds.size === posts.length}
                  onCheckedChange={(checked) => {
                    if (checked) setSelectedIds(new Set(posts.map((p) => p.id)));
                    else setSelectedIds(new Set());
                  }}
                />
              </th>
              <th className="text-left font-medium px-4 py-3" style={{ color: "var(--cr-text-3)" }}>Caption</th>
              <th className="text-left font-medium px-4 py-3" style={{ color: "var(--cr-text-3)" }}>Motivo</th>
              <th className="text-left font-medium px-4 py-3" style={{ color: "var(--cr-text-3)" }}>Score</th>
              <th className="w-20"></th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {posts.map((post) => {
              const analysis =
                typeof post.analysis === "string"
                  ? (() => { try { return JSON.parse(post.analysis); } catch { return null; } })()
                  : post.analysis;
              const score = analysis?.score_relevancia;
              const motivo = analysis?.motivo_descarte;
              const scoreColor = score != null
                ? score >= 8 ? "var(--cr-score-high)" : score >= 6 ? "var(--cr-score-mid)" : "var(--cr-score-low)"
                : "var(--cr-text-3)";
              const scoreBg = score != null
                ? score >= 8 ? "var(--cr-green-muted)" : score >= 6 ? "var(--cr-amber-muted)" : "var(--cr-red-muted)"
                : "transparent";

              return (
                <tr
                  key={post.id}
                  className="transition-colors"
                  style={{ borderBottom: "1px solid var(--cr-border)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--cr-surface-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <td className="px-3 py-3">
                    <Checkbox
                      checked={selectedIds.has(post.id)}
                      onCheckedChange={() => toggleSelect(post.id)}
                    />
                  </td>
                  <td className="px-4 py-3 max-w-xs truncate" style={{ color: "var(--cr-text-2)" }}>
                    {post.caption || "\u2014"}
                  </td>
                  <td className="px-4 py-3 max-w-xs truncate" style={{ color: "var(--cr-red)" }}>
                    {motivo || "--"}
                  </td>
                  <td className="px-4 py-3">
                    {score != null ? (
                      <span
                        className="font-semibold text-xs tabular-nums"
                        style={{ color: scoreColor, background: scoreBg, padding: "1px 6px", borderRadius: "4px" }}
                      >
                        {score}
                      </span>
                    ) : (
                      <span style={{ color: "var(--cr-text-3)", fontSize: "12px" }}>--</span>
                    )}
                  </td>
                  <td className="px-2 py-3">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-[11px] h-7"
                      style={{
                        borderColor: "var(--cr-accent-border)",
                        color: "var(--cr-accent)",
                        background: "transparent",
                        fontFamily: f,
                      }}
                      onClick={() => handleRecuperar(post)}
                    >
                      Recuperar
                    </Button>
                  </td>
                  <td className="px-1 py-3 text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => setDeletingPost(post)}
                    >
                      <Trash2
                        className="w-3.5 h-3.5 transition-colors"
                        style={{ color: "var(--cr-text-3)" }}
                      />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>

    <AlertDialog open={bulkDeleting} onOpenChange={(open) => !open && setBulkDeleting(false)}>
      <AlertDialogContent style={{ background: "var(--cr-dialog-bg)", border: "1px solid var(--cr-border)", fontFamily: f }}>
        <AlertDialogHeader>
          <AlertDialogTitle style={{ color: "var(--cr-text-1)" }}>Excluir {selectedIds.size} post(s)?</AlertDialogTitle>
          <AlertDialogDescription style={{ color: "var(--cr-text-2)" }}>
            Os posts selecionados serao removidos permanentemente.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel style={{ border: "1px solid var(--cr-border)", color: "var(--cr-text-2)", background: "transparent" }}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleBulkDelete} style={{ background: "var(--cr-red)", color: "#fff", border: "none" }}>Excluir</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog open={!!deletingPost} onOpenChange={(open) => !open && setDeletingPost(null)}>
      <AlertDialogContent style={{ background: "var(--cr-dialog-bg)", border: "1px solid var(--cr-border)", fontFamily: f }}>
        <AlertDialogHeader>
          <AlertDialogTitle style={{ color: "var(--cr-text-1)" }}>Excluir post?</AlertDialogTitle>
          <AlertDialogDescription style={{ color: "var(--cr-text-2)" }}>
            Este post sera removido permanentemente. Esta acao nao pode ser desfeita.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel style={{ border: "1px solid var(--cr-border)", color: "var(--cr-text-2)", background: "transparent" }}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleDeletePost} style={{ background: "var(--cr-red)", color: "#fff", border: "none" }}>Excluir</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

// ─── Readaptados list ─────────────────────────────────────────────────────────

function ReadaptadosList({ profileId }: { profileId: string }) {
  const { log } = useToolLogger();
  const [posts, setPosts] = useState<InspirationPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [deletingPost, setDeletingPost] = useState<InspirationPost | null>(null);

  const fetchPosts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("inspiration_posts")
        .select("*")
        .eq("profile_id", profileId)
        .eq("readapted", true)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPosts(data || []);
    } catch (err: any) {
      toast.error(err.message || "Erro ao buscar posts readaptados");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPosts();
  }, [profileId]);

  const toggleReadapted = async (post: InspirationPost) => {
    try {
      const { error } = await supabase
        .from("inspiration_posts")
        .update({ readapted: false })
        .eq("id", post.id);

      if (error) throw error;

      const { error: deleteError } = await supabase
        .from("readapted_posts")
        .delete()
        .eq("inspiration_post_id", post.id);

      if (deleteError) throw deleteError;

      toast.success("Post removido dos readaptados");
      log({ toolId: "criativos-inspiracao", actionType: "record_update", actionDetail: `Removeu post dos readaptados (${(post.caption || "").slice(0, 50)}...)`, metadata: { postId: post.id } });
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
      selectedIds.delete(post.id);
      setSelectedIds(new Set(selectedIds));
    } catch (err: any) {
      toast.error(err.message || "Erro ao atualizar post");
    }
  };

  const handleDeletePost = async () => {
    if (!deletingPost) return;
    try {
      const { error } = await supabase
        .from("inspiration_posts")
        .delete()
        .eq("id", deletingPost.id);
      if (error) throw error;
      setPosts((prev) => prev.filter((p) => p.id !== deletingPost.id));
      selectedIds.delete(deletingPost.id);
      setSelectedIds(new Set(selectedIds));
      toast.success("Post excluido");
      log({ toolId: "criativos-inspiracao", actionType: "record_delete", actionDetail: `Excluiu post readaptado (${(deletingPost.caption || "").slice(0, 50)}...)`, metadata: { postId: deletingPost.id } });
      setDeletingPost(null);
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir post");
    }
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    try {
      const { error } = await supabase
        .from("inspiration_posts")
        .delete()
        .in("id", ids);
      if (error) throw error;
      setPosts((prev) => prev.filter((p) => !selectedIds.has(p.id)));
      toast.success(`${ids.length} post(s) excluido(s)`);
      log({ toolId: "criativos-inspiracao", actionType: "bulk_action", actionDetail: `Excluiu ${ids.length} post(s) readaptado(s) em massa`, metadata: { count: ids.length, postIds: ids } });
      setSelectedIds(new Set());
      setBulkDeleting(false);
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir posts");
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const f = "var(--cr-font)";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--cr-text-3)" }} />
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: "var(--cr-surface)" }}
        >
          <CheckCircle2 className="w-4 h-4" style={{ color: "var(--cr-text-3)" }} />
        </div>
        <p style={{ color: "var(--cr-text-3)", fontFamily: f, fontSize: "13px" }}>
          Nenhum post readaptado encontrado.
        </p>
      </div>
    );
  }

  return (
    <>
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: "1px solid var(--cr-border)", fontFamily: f }}
    >
      {selectedIds.size > 0 && (
        <div
          className="flex items-center justify-between px-4 py-2"
          style={{ background: "var(--cr-surface)", borderBottom: "1px solid var(--cr-border)" }}
        >
          <span className="text-[13px] font-medium" style={{ color: "var(--cr-text-2)" }}>
            {selectedIds.size} selecionado(s)
          </span>
          <Button
            size="sm"
            className="gap-1.5 text-xs h-7"
            style={{ background: "var(--cr-red)", color: "#fff", fontFamily: f }}
            onClick={() => setBulkDeleting(true)}
          >
            <Trash2 className="w-3 h-3" />
            Excluir selecionados
          </Button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--cr-border)", background: "var(--cr-surface)" }}>
              <th className="w-10 px-3 py-3">
                <Checkbox
                  checked={posts.length > 0 && selectedIds.size === posts.length}
                  onCheckedChange={(checked) => {
                    if (checked) setSelectedIds(new Set(posts.map((p) => p.id)));
                    else setSelectedIds(new Set());
                  }}
                />
              </th>
              <th className="text-left font-medium px-4 py-3" style={{ color: "var(--cr-text-3)" }}>Tipo</th>
              <th className="text-left font-medium px-4 py-3" style={{ color: "var(--cr-text-3)" }}>Caption</th>
              <th className="text-left font-medium px-4 py-3" style={{ color: "var(--cr-text-3)" }}>Tema</th>
              <th className="text-left font-medium px-4 py-3" style={{ color: "var(--cr-text-3)" }}>Score</th>
              <th className="text-center font-medium px-4 py-3" style={{ color: "var(--cr-text-3)" }}>Readaptado</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {posts.map((post) => {
              const analysis =
                typeof post.analysis === "string"
                  ? (() => { try { return JSON.parse(post.analysis); } catch { return null; } })()
                  : post.analysis;
              const tema = analysis?.tema || "--";
              const score = analysis?.score_relevancia;
              const scoreColor = score != null
                ? score >= 8 ? "var(--cr-score-high)" : score >= 6 ? "var(--cr-score-mid)" : "var(--cr-score-low)"
                : "var(--cr-text-3)";
              const scoreBg = score != null
                ? score >= 8 ? "var(--cr-green-muted)" : score >= 6 ? "var(--cr-amber-muted)" : "var(--cr-red-muted)"
                : "transparent";

              return (
                <tr
                  key={post.id}
                  className="transition-colors"
                  style={{ borderBottom: "1px solid var(--cr-border)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--cr-surface-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <td className="px-3 py-3">
                    <Checkbox
                      checked={selectedIds.has(post.id)}
                      onCheckedChange={() => toggleSelect(post.id)}
                    />
                  </td>
                  <td className="px-4 py-3">
                    {(() => {
                      const badge = getMediaBadgeStyle(post.media_type);
                      const BadgeIcon = badge.icon;
                      return (
                        <span
                          className="inline-flex items-center gap-[5px] px-[9px] py-[3px] rounded-full text-[10px] font-semibold capitalize"
                          style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}
                        >
                          <BadgeIcon className="w-3 h-3" />
                          {badge.label}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3 max-w-xs truncate" style={{ color: "var(--cr-text-2)" }}>
                    {post.caption || "--"}
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--cr-text-2)" }}>{tema}</td>
                  <td className="px-4 py-3">
                    {score != null ? (
                      <span
                        className="font-semibold text-xs tabular-nums"
                        style={{ color: scoreColor, background: scoreBg, padding: "1px 6px", borderRadius: "4px" }}
                      >
                        {score}
                      </span>
                    ) : (
                      <span style={{ color: "var(--cr-text-3)", fontSize: "12px" }}>--</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Switch
                      checked={post.readapted}
                      onCheckedChange={() => toggleReadapted(post)}
                    />
                  </td>
                  <td className="px-1 py-3 text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => setDeletingPost(post)}
                    >
                      <Trash2
                        className="w-3.5 h-3.5 transition-colors"
                        style={{ color: "var(--cr-text-3)" }}
                      />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>

    <AlertDialog open={bulkDeleting} onOpenChange={(open) => !open && setBulkDeleting(false)}>
      <AlertDialogContent style={{ background: "var(--cr-dialog-bg)", border: "1px solid var(--cr-border)", fontFamily: f }}>
        <AlertDialogHeader>
          <AlertDialogTitle style={{ color: "var(--cr-text-1)" }}>Excluir {selectedIds.size} post(s)?</AlertDialogTitle>
          <AlertDialogDescription style={{ color: "var(--cr-text-2)" }}>
            Os posts selecionados serao removidos permanentemente.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel style={{ border: "1px solid var(--cr-border)", color: "var(--cr-text-2)", background: "transparent" }}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleBulkDelete} style={{ background: "var(--cr-red)", color: "#fff", border: "none" }}>Excluir</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog open={!!deletingPost} onOpenChange={(open) => !open && setDeletingPost(null)}>
      <AlertDialogContent style={{ background: "var(--cr-dialog-bg)", border: "1px solid var(--cr-border)", fontFamily: f }}>
        <AlertDialogHeader>
          <AlertDialogTitle style={{ color: "var(--cr-text-1)" }}>Excluir post?</AlertDialogTitle>
          <AlertDialogDescription style={{ color: "var(--cr-text-2)" }}>
            Este post sera removido permanentemente. Esta acao nao pode ser desfeita.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel style={{ border: "1px solid var(--cr-border)", color: "var(--cr-text-2)", background: "transparent" }}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleDeletePost} style={{ background: "var(--cr-red)", color: "#fff", border: "none" }}>Excluir</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

// ─── Main Inspiracao page ──────────────────────────────────────────────────────

export default function Inspiracao() {
  const [selectedProfile, setSelectedProfile] = useState<InspirationProfile | null>(null);
  const [activeTab, setActiveTab] = useState<"posts" | "readaptados" | "descartados">("posts");

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="flex-1 p-8 overflow-y-auto min-h-full bg-background"
      style={{ fontFamily: "var(--cr-font)" }}
    >
      <div className="criativos-bg" aria-hidden="true">
        <div style={{
          position: 'absolute',
          width: '400px',
          height: '400px',
          top: '30%',
          left: '20%',
          background: 'radial-gradient(circle, rgba(232,96,74,0.07) 0%, transparent 65%)',
          borderRadius: '50%',
          animation: 'orb-3 26s ease-in-out infinite',
        }} />
      </div>
      <div className="max-w-6xl mx-auto space-y-8 relative z-[1]">
        {/* Header */}
        <div className="flex items-center gap-4">
          <div
            className="w-10 h-10 rounded-[10px] flex items-center justify-center flex-shrink-0"
            style={{ background: "var(--cr-grad-soft)", border: "1px solid rgba(232,96,74, 0.25)" }}
          >
            <Sparkles className="w-[18px] h-[18px]" style={{ color: "rgba(232,96,74, 0.9)" }} />
          </div>
          <div>
            <h1
              className="text-xl font-bold tracking-[-0.02em]"
              style={{ color: "var(--cr-text-1)", fontFamily: "'Outfit', sans-serif" }}
            >
              Inspiracao
            </h1>
            <p className="text-[13px]" style={{ color: "var(--cr-text-3)" }}>
              Gerencie perfis de referencia e scrapeie posts para analise
            </p>
          </div>
        </div>

        {/* Profile List */}
        <ProfileList
          selectedProfileId={selectedProfile?.id ?? null}
          onSelectProfile={setSelectedProfile}
        />

        {/* Posts section with tabs */}
        {selectedProfile && (
          <motion.div
            key={selectedProfile.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium" style={{ color: "var(--cr-text-2)" }}>
                Posts de{" "}
                <span className="font-semibold" style={{ color: "var(--cr-accent)" }}>
                  @{selectedProfile.own_instagram}
                </span>
              </h2>
            </div>

            {/* Tab bar */}
            <div
              className="inline-flex gap-0.5 p-1 rounded-lg"
              style={{ background: "var(--cr-surface)" }}
            >
              {(["posts", "readaptados", "descartados"] as const).map((tab) => {
                const label = tab === "posts" ? "Posts" : tab === "readaptados" ? "Ja readaptados" : "Descartados";
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className="px-4 py-1.5 rounded-md text-[13px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
                    style={{
                      background: activeTab === tab ? "var(--cr-grad)" : "transparent",
                      color: activeTab === tab ? "#fff" : "var(--cr-text-3)",
                      fontFamily: "var(--cr-font)",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Tab content */}
            {activeTab === "posts" ? (
              <PostsTable
                profileId={selectedProfile.id}
                clientName={selectedProfile.client_name}
              />
            ) : activeTab === "readaptados" ? (
              <ReadaptadosList profileId={selectedProfile.id} />
            ) : (
              <DescartadosList profileId={selectedProfile.id} />
            )}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
