import { useState, useEffect } from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { Sparkles, Loader2, RotateCcw, CheckCircle2, Inbox, Trash2, Video, Image, LayoutGrid, ChevronLeft } from "lucide-react";
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

function getMediaBadgeClass(type: string | null) {
  const t = (type || "").toLowerCase();
  if (t === "video" || t === "reel") return "badge badge-video";
  if (t === "carousel" || t === "sidecar") return "badge badge-carousel";
  return "badge badge-image";
}

function getMediaBadgeLabel(type: string | null) {
  const t = (type || "").toLowerCase();
  if (t === "carousel" || t === "sidecar") return "Carrossel";
  return type || "post";
}

function getMediaBadgeIcon(type: string | null) {
  const t = (type || "").toLowerCase();
  if (t === "video" || t === "reel") return Video;
  if (t === "carousel" || t === "sidecar") return LayoutGrid;
  return Image;
}

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--text-3)" }} />
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: "var(--surface)" }}
        >
          <RotateCcw className="w-4 h-4" style={{ color: "var(--text-3)" }} />
        </div>
        <p style={{ color: "var(--text-3)", fontSize: "13px" }}>
          Nenhum post descartado encontrado.
        </p>
      </div>
    );
  }

  return (
    <>
    <div className="table-wrap">
      {selectedIds.size > 0 && (
        <div
          className="flex items-center justify-between px-4 py-2"
          style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}
        >
          <span className="text-[13px] font-medium" style={{ color: "var(--text-2)" }}>
            {selectedIds.size} selecionado(s)
          </span>
          <Button
            size="sm"
            className="gap-1.5 text-xs h-7"
            style={{ background: "#ef4444", color: "#fff" }}
            onClick={() => setBulkDeleting(true)}
          >
            <Trash2 className="w-3 h-3" />
            Excluir selecionados
          </Button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-10 px-5 py-4">
                <Checkbox
                  checked={posts.length > 0 && selectedIds.size === posts.length}
                  onCheckedChange={(checked) => {
                    if (checked) setSelectedIds(new Set(posts.map((p) => p.id)));
                    else setSelectedIds(new Set());
                  }}
                />
              </th>
              <th className="text-left px-5 py-4">Caption</th>
              <th className="text-left px-5 py-4">Motivo</th>
              <th className="text-left px-5 py-4">Score</th>
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

              return (
                <tr key={post.id}>
                  <td className="px-5 py-4">
                    <Checkbox
                      checked={selectedIds.has(post.id)}
                      onCheckedChange={() => toggleSelect(post.id)}
                    />
                  </td>
                  <td className="td-text px-5 py-4">
                    {post.caption || "\u2014"}
                  </td>
                  <td className="px-5 py-4 max-w-xs truncate" style={{ color: "#ef4444" }}>
                    {motivo || "--"}
                  </td>
                  <td className="px-5 py-4">
                    <ScoreBar score={score} />
                  </td>
                  <td className="px-5 py-4">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-[12px] h-7"
                      style={{
                        borderColor: "rgba(194,57,110,.18)",
                        color: "var(--accent)",
                        background: "transparent",
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
                        style={{ color: "var(--text-3)" }}
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
      <AlertDialogContent style={{ background: "var(--dialog-bg)", border: "1px solid var(--border)" }}>
        <AlertDialogHeader>
          <AlertDialogTitle style={{ color: "var(--text-1)" }}>Excluir {selectedIds.size} post(s)?</AlertDialogTitle>
          <AlertDialogDescription style={{ color: "var(--text-2)" }}>
            Os posts selecionados serao removidos permanentemente.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel style={{ border: "1px solid var(--border)", color: "var(--text-2)", background: "transparent" }}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleBulkDelete} style={{ background: "#ef4444", color: "#fff", border: "none" }}>Excluir</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog open={!!deletingPost} onOpenChange={(open) => !open && setDeletingPost(null)}>
      <AlertDialogContent style={{ background: "var(--dialog-bg)", border: "1px solid var(--border)" }}>
        <AlertDialogHeader>
          <AlertDialogTitle style={{ color: "var(--text-1)" }}>Excluir post?</AlertDialogTitle>
          <AlertDialogDescription style={{ color: "var(--text-2)" }}>
            Este post sera removido permanentemente. Esta acao nao pode ser desfeita.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel style={{ border: "1px solid var(--border)", color: "var(--text-2)", background: "transparent" }}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleDeletePost} style={{ background: "#ef4444", color: "#fff", border: "none" }}>Excluir</AlertDialogAction>
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--text-3)" }} />
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: "var(--surface)" }}
        >
          <CheckCircle2 className="w-4 h-4" style={{ color: "var(--text-3)" }} />
        </div>
        <p style={{ color: "var(--text-3)", fontSize: "13px" }}>
          Nenhum post readaptado encontrado.
        </p>
      </div>
    );
  }

  return (
    <>
    <div className="table-wrap">
      {selectedIds.size > 0 && (
        <div
          className="flex items-center justify-between px-4 py-2"
          style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}
        >
          <span className="text-[13px] font-medium" style={{ color: "var(--text-2)" }}>
            {selectedIds.size} selecionado(s)
          </span>
          <Button
            size="sm"
            className="gap-1.5 text-xs h-7"
            style={{ background: "#ef4444", color: "#fff" }}
            onClick={() => setBulkDeleting(true)}
          >
            <Trash2 className="w-3 h-3" />
            Excluir selecionados
          </Button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-10 px-5 py-4">
                <Checkbox
                  checked={posts.length > 0 && selectedIds.size === posts.length}
                  onCheckedChange={(checked) => {
                    if (checked) setSelectedIds(new Set(posts.map((p) => p.id)));
                    else setSelectedIds(new Set());
                  }}
                />
              </th>
              <th className="text-left px-5 py-4">Tipo</th>
              <th className="text-left px-5 py-4">Caption</th>
              <th className="text-left px-5 py-4">Tema</th>
              <th className="text-left px-5 py-4">Score</th>
              <th className="text-center px-5 py-4">Readaptado</th>
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
              const BadgeIcon = getMediaBadgeIcon(post.media_type);

              return (
                <tr key={post.id}>
                  <td className="px-5 py-4">
                    <Checkbox
                      checked={selectedIds.has(post.id)}
                      onCheckedChange={() => toggleSelect(post.id)}
                    />
                  </td>
                  <td className="px-5 py-4">
                    <span className={getMediaBadgeClass(post.media_type)}>
                      <BadgeIcon className="w-3 h-3" />
                      {getMediaBadgeLabel(post.media_type)}
                    </span>
                  </td>
                  <td className="td-text px-5 py-4">
                    {post.caption || "--"}
                  </td>
                  <td className="px-5 py-4" style={{ color: "var(--text-2)" }}>{tema}</td>
                  <td className="px-5 py-4">
                    <ScoreBar score={score} />
                  </td>
                  <td className="px-5 py-4 text-center">
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
                        style={{ color: "var(--text-3)" }}
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
      <AlertDialogContent style={{ background: "var(--dialog-bg)", border: "1px solid var(--border)" }}>
        <AlertDialogHeader>
          <AlertDialogTitle style={{ color: "var(--text-1)" }}>Excluir {selectedIds.size} post(s)?</AlertDialogTitle>
          <AlertDialogDescription style={{ color: "var(--text-2)" }}>
            Os posts selecionados serao removidos permanentemente.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel style={{ border: "1px solid var(--border)", color: "var(--text-2)", background: "transparent" }}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleBulkDelete} style={{ background: "#ef4444", color: "#fff", border: "none" }}>Excluir</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog open={!!deletingPost} onOpenChange={(open) => !open && setDeletingPost(null)}>
      <AlertDialogContent style={{ background: "var(--dialog-bg)", border: "1px solid var(--border)" }}>
        <AlertDialogHeader>
          <AlertDialogTitle style={{ color: "var(--text-1)" }}>Excluir post?</AlertDialogTitle>
          <AlertDialogDescription style={{ color: "var(--text-2)" }}>
            Este post sera removido permanentemente. Esta acao nao pode ser desfeita.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel style={{ border: "1px solid var(--border)", color: "var(--text-2)", background: "transparent" }}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleDeletePost} style={{ background: "#ef4444", color: "#fff", border: "none" }}>Excluir</AlertDialogAction>
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
  const tabs = [
    { key: "posts" as const, label: "Posts" },
    { key: "readaptados" as const, label: "Ja readaptados" },
    { key: "descartados" as const, label: "Descartados" },
  ];

  return (
    <div className="flex flex-col flex-1">
      {/* Sticky page header */}
      <div className="page-header">
        <div className="page-header-icon">
          <Sparkles className="w-[18px] h-[18px]" style={{ color: "var(--accent)" }} />
        </div>
        <div>
          <h1 className="page-header-title" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700 }}>Perfis</h1>
          <p className="page-header-sub">Gerencie perfis de referencia e scrapeie posts para analise</p>
        </div>
      </div>

      <div className="page-content overflow-y-auto flex-1">
      <div className="w-full px-6 space-y-8">

        {/* Profile List (hidden when a profile is selected) */}
        {!selectedProfile && (
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <ProfileList
              selectedProfileId={null}
              onSelectProfile={setSelectedProfile}
            />
          </motion.div>
        )}

        {/* Posts section — inline below */}
        {selectedProfile && (
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Back + profile header */}
            <motion.div className="flex items-center gap-4" style={{ marginBottom: 32 }} layout>
              <button
                onClick={() => { setSelectedProfile(null); setActiveTab("posts"); }}
                className="icon-btn"
                style={{ width: 32, height: 32 }}
              >
                <ChevronLeft size={15} />
              </button>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-1)" }}>
                  Posts de @{selectedProfile.own_instagram}
                </h2>
                <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                  {selectedProfile.client_name}
                </p>
                </div>
            </motion.div>

            {/* Tab bar */}
            <LayoutGroup id="inspiracao-tabs">
              <div style={{ marginBottom: 28 }}>
                <div
                  className="inline-flex gap-1 p-1.5 rounded-[20px]"
                  style={{ background: "rgba(16, 24, 46, 0.78)", border: "1px solid var(--border)" }}
                >
                  {tabs.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setActiveTab(tab.key)}
                      className="relative px-5 py-2.5 rounded-[16px] text-[13px] font-semibold transition-all"
                      style={{
                        color: activeTab === tab.key ? "#150b12" : "var(--text-3)",
                      }}
                    >
                      {activeTab === tab.key ? (
                        <motion.span
                          layoutId="inspiracao-tab-pill"
                          className="absolute inset-0 rounded-[16px]"
                          style={{ background: "var(--grad)", boxShadow: "var(--shadow-glow)" }}
                          transition={{ type: "spring", stiffness: 420, damping: 32 }}
                        />
                      ) : null}
                      <span className="relative z-[1]">{tab.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </LayoutGroup>

            {/* Tab content */}
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              >
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
            </AnimatePresence>
          </motion.div>
        )}

      </div>
      </div>
    </div>
  );
}
