import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  ChevronRight,
  ExternalLink,
  Lightbulb,
  Hash,
  Sparkles,
  FileText,
  TrendingUp,
  AlertTriangle,
  Copy,
  Trash2,
  Inbox,
  Search,
  Video,
  Image,
  LayoutGrid,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { InspirationPost } from "./types";
import { useToolLogger } from "@/hooks/useToolLogger";

function getMediaBadgeStyle(type: string | null) {
  const t = (type || "").toLowerCase();
  if (t === "video" || t === "reel") {
    return {
      bg: "var(--cr-badge-video-bg)",
      color: "var(--cr-badge-video-color)",
      border: "var(--cr-badge-video-border)",
      icon: Video,
    };
  }
  if (t === "carousel" || t === "sidecar") {
    return {
      bg: "var(--cr-badge-carousel-bg)",
      color: "var(--cr-badge-carousel-color)",
      border: "var(--cr-badge-carousel-border)",
      icon: LayoutGrid,
    };
  }
  return {
    bg: "var(--cr-badge-image-bg)",
    color: "var(--cr-badge-image-color)",
    border: "var(--cr-badge-image-border)",
    icon: Image,
  };
}

interface Props {
  profileId: string;
  clientName: string;
}

function ScoreBar({ score }: { score: number | undefined | null }) {
  if (score == null) return <span style={{ color: "var(--cr-text-3)", fontSize: "12px" }}>--</span>;
  const color = score >= 8 ? "var(--cr-score-high)" : score >= 6 ? "var(--cr-score-mid)" : "var(--cr-score-low)";
  const pct = Math.min(100, (score / 10) * 100);
  return (
    <div className="flex items-center gap-2">
      <div
        className="w-12 h-1 rounded-full overflow-hidden"
        style={{ background: "rgba(255,255,255,0.08)" }}
      >
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span
        className="font-bold text-xs tabular-nums"
        style={{ color, fontFamily: "'Outfit', sans-serif" }}
      >
        {score}
      </span>
    </div>
  );
}

function AnalysisCard({
  icon: Icon,
  label,
  color,
  bgColor,
  children,
}: {
  icon: React.ElementType;
  label: string;
  color: string;
  bgColor: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl p-4 transition-colors"
      style={{
        background: "var(--cr-surface)",
        border: "1px solid var(--cr-border)",
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center"
          style={{ background: bgColor }}
        >
          <Icon className="w-3 h-3" style={{ color }} />
        </div>
        <span
          className="text-[10px] font-semibold uppercase tracking-wider"
          style={{ color, fontFamily: "var(--cr-font)" }}
        >
          {label}
        </span>
      </div>
      {children}
    </div>
  );
}

export default function PostsTable({ profileId, clientName }: Props) {
  const { log } = useToolLogger();
  const [posts, setPosts] = useState<InspirationPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [deletingPost, setDeletingPost] = useState<InspirationPost | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchPosts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("inspiration_posts")
        .select("*")
        .eq("profile_id", profileId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPosts(data || []);
    } catch (err: any) {
      toast.error(err.message || "Erro ao buscar posts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPosts();
  }, [profileId]);

  const toggleReadapted = async (post: InspirationPost) => {
    const newValue = !post.readapted;
    try {
      const { error } = await supabase
        .from("inspiration_posts")
        .update({ readapted: newValue })
        .eq("id", post.id);

      if (error) throw error;

      if (newValue) {
        const analysis =
          typeof post.analysis === "string"
            ? (() => { try { return JSON.parse(post.analysis); } catch { return null; } })()
            : post.analysis;

        // Resolve client_name: use prop, fallback to DB lookup
        let resolvedClientName = clientName;
        if (!resolvedClientName) {
          const { data: profile } = await supabase
            .from("inspiration_profiles")
            .select("client_name")
            .eq("id", profileId)
            .single();
          resolvedClientName = profile?.client_name || "";
        }

        // Extract transcricao from analysis JSON (inspiration_posts has no transcricao column)
        const transcricao = analysis?.transcricao ?? analysis?.transcription ?? null;

        const insertPayload = {
          inspiration_post_id: post.id,
          profile_id: profileId,
          client_name: resolvedClientName,
          original_caption: post.caption,
          original_post_url: post.post_url,
          original_thumbnail_url: post.thumbnail_url,
          media_type: post.media_type,
          tema: analysis?.tema || null,
          gancho: analysis?.gancho || null,
          sugestao_readaptacao: analysis?.sugestao_readaptacao || null,
          score_relevancia: analysis?.score_relevancia ?? null,
          curtidas: post.curtidas || 0,
          envios: 0,
          visualizacoes: post.visualizacoes || 0,
          transcricao,
        };

        const { error: insertError } = await supabase
          .from("readapted_posts")
          .upsert(insertPayload, { onConflict: "inspiration_post_id" });

        if (insertError) throw insertError;
      } else {
        const { error: deleteError } = await supabase
          .from("readapted_posts")
          .delete()
          .eq("inspiration_post_id", post.id);

        if (deleteError) throw deleteError;
      }

      toast.success(`${newValue ? "Marcou" : "Desmarcou"} como readaptado`);
      log({ toolId: "criativos-inspiracao", actionType: "record_update", actionDetail: `${newValue ? "Marcou" : "Desmarcou"} post como readaptado (${(post.caption || "").slice(0, 50)}...)`, metadata: { postId: post.id, readapted: newValue } });
      fetchPosts();
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
      toast.success("Post excluido");
      log({ toolId: "criativos-inspiracao", actionType: "record_delete", actionDetail: `Excluiu post (${(deletingPost.caption || "").slice(0, 50)}...)`, metadata: { postId: deletingPost.id } });
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
      log({ toolId: "criativos-inspiracao", actionType: "bulk_action", actionDetail: `Excluiu ${ids.length} post(s) em massa`, metadata: { count: ids.length, postIds: ids } });
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
          <Inbox className="w-4 h-4" style={{ color: "var(--cr-text-3)" }} />
        </div>
        <p className="text-[13px]" style={{ color: "var(--cr-text-3)", fontFamily: f }}>
          Nenhum post encontrado para este perfil.
        </p>
      </div>
    );
  }

  const filteredPosts = posts.filter((post) => {
    if (post.readapted) return false;
    const a =
      typeof post.analysis === "string"
        ? (() => { try { return JSON.parse(post.analysis); } catch { return null; } })()
        : post.analysis;
    if (a?.descartar) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const caption = (post.caption || "").toLowerCase();
      const tema = (a?.tema || "").toLowerCase();
      const tipo = (post.media_type || "").toLowerCase();
      if (!caption.includes(q) && !tema.includes(q) && !tipo.includes(q)) return false;
    }
    return true;
  });

  return (
    <>
    <div className="mb-3 relative">
      <Search
        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
        style={{ color: "var(--cr-text-3)" }}
      />
      <Input
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Buscar por caption, tema ou tipo..."
        className="pl-10 h-9 text-sm border-0 focus-visible:ring-1"
        style={{
          background: "var(--cr-surface)",
          color: "var(--cr-text-1)",
          fontFamily: f,
          borderRadius: "0.75rem",
          border: "1px solid var(--cr-border)",
        }}
      />
    </div>
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: "1px solid var(--cr-border)", fontFamily: f }}
    >
      {filteredPosts.length === 0 && posts.length > 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Inbox className="w-4 h-4" style={{ color: "var(--cr-text-3)" }} />
          <p className="text-[13px]" style={{ color: "var(--cr-text-3)" }}>
            Nenhum post encontrado.
          </p>
        </div>
      ) : (
        <>
        {selectedIds.size > 0 && (
          <div
            className="flex items-center justify-between px-4 py-2"
            style={{ background: "var(--cr-surface)", borderBottom: "1px solid var(--cr-border)" }}
          >
            <span className="text-[13px] font-medium" style={{ color: "var(--cr-text-2)", fontFamily: f }}>
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
                    checked={filteredPosts.length > 0 && selectedIds.size === filteredPosts.length}
                    onCheckedChange={(checked) => {
                      if (checked) setSelectedIds(new Set(filteredPosts.map((p) => p.id)));
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
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {filteredPosts.map((post) => {
                const analysis =
                  typeof post.analysis === "string"
                    ? (() => { try { return JSON.parse(post.analysis); } catch { return null; } })()
                    : post.analysis;
                const tema = analysis?.tema || "--";
                const score = analysis?.score_relevancia;
                const isExpanded = expandedPostId === post.id;
                const isDescartado = !!analysis?.descartar;

                return (
                  <React.Fragment key={post.id}>
                    <tr
                      onClick={() => setExpandedPostId(isExpanded ? null : post.id)}
                      className="transition-colors cursor-pointer group/row"
                      style={{
                        borderBottom: "1px solid var(--cr-border)",
                        background: isExpanded ? "var(--cr-surface-active)" : "transparent",
                        opacity: isDescartado ? 0.4 : 1,
                      }}
                      onMouseEnter={(e) => {
                        if (!isExpanded) e.currentTarget.style.background = "var(--cr-surface-hover)";
                      }}
                      onMouseLeave={(e) => {
                        if (!isExpanded) e.currentTarget.style.background = "transparent";
                      }}
                    >
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
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
                              style={{
                                background: badge.bg,
                                color: badge.color,
                                border: `1px solid ${badge.border}`,
                              }}
                            >
                              <BadgeIcon className="w-3 h-3" />
                              {(post.media_type || "").toLowerCase() === "carousel" || (post.media_type || "").toLowerCase() === "sidecar" ? "Carrossel" : (post.media_type || "post")}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3 max-w-xs truncate" style={{ color: "var(--cr-text-2)" }}>
                        {post.caption || "--"}
                      </td>
                      <td className="px-4 py-3 max-w-[140px]">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="block truncate" style={{ color: "var(--cr-text-2)" }}>{tema}</span>
                            </TooltipTrigger>
                            {tema !== "--" && (
                              <TooltipContent
                                style={{ background: "var(--cr-surface-4)", border: "1px solid var(--cr-border-hover)", borderRadius: "6px" }}
                              >
                                <p className="text-xs max-w-xs" style={{ color: "var(--cr-text-1)" }}>{tema}</p>
                              </TooltipContent>
                            )}
                          </Tooltip>
                        </TooltipProvider>
                      </td>
                      <td className="px-4 py-3">
                        <ScoreBar score={score} />
                      </td>
                      <td
                        className="px-4 py-3 text-center"
                        style={isDescartado ? { opacity: 0.5 } : undefined}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Switch
                          checked={post.readapted}
                          onCheckedChange={() => toggleReadapted(post)}
                          disabled={isDescartado}
                        />
                      </td>
                      <td className="px-3 py-3 text-center">
                        <ChevronRight
                          className="w-4 h-4 inline-block transition-transform"
                          style={{
                            color: "var(--cr-text-3)",
                            transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                          }}
                        />
                      </td>
                      <td className="px-1 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="w-7 h-7 rounded-md flex items-center justify-center border border-transparent transition-all opacity-0 group-hover/row:opacity-100 hover:bg-[rgba(232,84,84,0.10)] hover:border-[rgba(232,84,84,0.20)]"
                          style={{ color: "var(--cr-text-3)" }}
                          onClick={() => setDeletingPost(post)}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--cr-score-low)"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--cr-text-3)"; }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>

                    <AnimatePresence>
                      {isExpanded && (
                        <tr key={`${post.id}-expanded`}>
                          <td colSpan={8} className="p-0" style={{ borderTop: "1px solid var(--cr-border)" }}>
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div className="p-5 space-y-4">
                                {/* Analysis cards row */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                  <AnalysisCard
                                    icon={Hash}
                                    label="Tema"
                                    color="var(--cr-violet)"
                                    bgColor="var(--cr-violet-muted)"
                                  >
                                    <p className="text-sm font-medium" style={{ color: "var(--cr-text-1)" }}>
                                      {analysis?.tema || "--"}
                                    </p>
                                  </AnalysisCard>

                                  <AnalysisCard
                                    icon={Lightbulb}
                                    label="Gancho"
                                    color="var(--cr-amber)"
                                    bgColor="var(--cr-amber-muted)"
                                  >
                                    <p className="text-sm font-medium" style={{ color: "var(--cr-text-1)" }}>
                                      {analysis?.gancho || "--"}
                                    </p>
                                  </AnalysisCard>

                                  <AnalysisCard
                                    icon={TrendingUp}
                                    label="Score & Formato"
                                    color="var(--cr-cyan)"
                                    bgColor="var(--cr-cyan-muted)"
                                  >
                                    <div className="flex items-center gap-3">
                                      <ScoreBar score={score} />
                                      {analysis?.formato_sugerido && (
                                        <Badge
                                          variant="outline"
                                          className="text-[10px]"
                                          style={{
                                            borderColor: "var(--cr-cyan-muted)",
                                            color: "var(--cr-cyan)",
                                            background: "var(--cr-cyan-muted)",
                                          }}
                                        >
                                          {analysis.formato_sugerido}
                                        </Badge>
                                      )}
                                    </div>
                                  </AnalysisCard>
                                </div>

                                {/* Caption */}
                                {post.caption && (
                                  <div
                                    className="relative rounded-xl overflow-hidden"
                                    style={{
                                      background: "var(--cr-surface)",
                                      border: "1px solid var(--cr-border)",
                                    }}
                                  >
                                    <div
                                      className="absolute left-0 top-0 bottom-0 w-[2px]"
                                      style={{ background: "var(--cr-border-active)" }}
                                    />
                                    <div className="pl-5 pr-4 py-4">
                                      <div className="flex items-center gap-2 mb-2">
                                        <FileText className="w-3.5 h-3.5" style={{ color: "var(--cr-text-3)" }} />
                                        <span
                                          className="text-[10px] font-semibold uppercase tracking-wider"
                                          style={{ color: "var(--cr-text-3)" }}
                                        >
                                          Caption Original
                                        </span>
                                      </div>
                                      <p className="text-sm leading-relaxed" style={{ color: "var(--cr-text-2)" }}>
                                        {post.caption}
                                      </p>
                                    </div>
                                  </div>
                                )}

                                {/* Sugestao de readaptacao */}
                                {analysis?.sugestao_readaptacao && (
                                  <div
                                    className="relative rounded-xl overflow-hidden"
                                    style={{
                                      background: "var(--cr-accent-muted)",
                                      border: "1px solid var(--cr-accent-border)",
                                    }}
                                  >
                                    <div
                                      className="absolute left-0 top-0 bottom-0 w-[2px]"
                                      style={{ background: "var(--cr-accent)" }}
                                    />
                                    <div className="pl-5 pr-4 py-4">
                                      <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                          <Sparkles className="w-3.5 h-3.5" style={{ color: "var(--cr-accent)" }} />
                                          <span
                                            className="text-[10px] font-semibold uppercase tracking-wider"
                                            style={{ color: "var(--cr-accent)" }}
                                          >
                                            Sugestao de Readaptacao
                                          </span>
                                        </div>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-6 px-2 text-[10px]"
                                          style={{ color: "var(--cr-accent)" }}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            navigator.clipboard.writeText(analysis.sugestao_readaptacao!);
                                            toast.success("Copiado!");
                                          }}
                                        >
                                          <Copy className="w-3 h-3 mr-1" />
                                          Copiar
                                        </Button>
                                      </div>
                                      <div className="prose prose-invert prose-sm max-w-none
                                        prose-headings:text-white prose-headings:font-semibold
                                        prose-h1:text-base prose-h1:mt-4 prose-h1:mb-2 prose-h1:border-b prose-h1:border-white/10 prose-h1:pb-2
                                        prose-h2:text-sm prose-h2:mt-3 prose-h2:mb-1.5
                                        prose-p:text-white/75 prose-p:text-sm prose-p:leading-relaxed prose-p:my-1.5
                                        prose-strong:text-white/90
                                        prose-li:text-white/70 prose-li:text-sm
                                        prose-hr:border-white/10 prose-hr:my-3
                                        prose-blockquote:border-[var(--cr-accent)]/30 prose-blockquote:text-white/60">
                                        <ReactMarkdown>{analysis.sugestao_readaptacao}</ReactMarkdown>
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {/* Motivo do descarte */}
                                {analysis?.descartar && analysis?.motivo_descarte && (
                                  <div
                                    className="relative rounded-xl overflow-hidden"
                                    style={{
                                      background: "var(--cr-red-muted)",
                                      border: "1px solid rgba(239, 68, 68, 0.2)",
                                    }}
                                  >
                                    <div
                                      className="absolute left-0 top-0 bottom-0 w-[2px]"
                                      style={{ background: "var(--cr-red)" }}
                                    />
                                    <div className="pl-5 pr-4 py-4">
                                      <div className="flex items-center gap-2 mb-2">
                                        <AlertTriangle className="w-3.5 h-3.5" style={{ color: "var(--cr-red)" }} />
                                        <span
                                          className="text-[10px] font-semibold uppercase tracking-wider"
                                          style={{ color: "var(--cr-red)" }}
                                        >
                                          Motivo do Descarte
                                        </span>
                                      </div>
                                      <p className="text-sm leading-relaxed" style={{ color: "var(--cr-text-2)" }}>
                                        {analysis.motivo_descarte}
                                      </p>
                                    </div>
                                  </div>
                                )}

                                {/* Link */}
                                {post.post_url && (
                                  <div className="pt-1">
                                    <a
                                      href={post.post_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="inline-flex items-center gap-1.5 text-sm font-medium transition-opacity hover:opacity-70"
                                      style={{ color: "var(--cr-accent)" }}
                                    >
                                      <ExternalLink className="w-3.5 h-3.5" />
                                      Ver post original
                                    </a>
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          </td>
                        </tr>
                      )}
                    </AnimatePresence>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>

    {/* Bulk Delete Confirmation */}
    <AlertDialog open={bulkDeleting} onOpenChange={(open) => !open && setBulkDeleting(false)}>
      <AlertDialogContent
        style={{
          background: "var(--cr-dialog-bg)",
          border: "1px solid var(--cr-border)",
          fontFamily: f,
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle style={{ color: "var(--cr-text-1)" }}>
            Excluir {selectedIds.size} post(s)?
          </AlertDialogTitle>
          <AlertDialogDescription style={{ color: "var(--cr-text-2)" }}>
            Os posts selecionados serao removidos permanentemente. Esta acao nao pode ser desfeita.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            style={{
              border: "1px solid var(--cr-border)",
              color: "var(--cr-text-2)",
              background: "transparent",
            }}
          >
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleBulkDelete}
            style={{ background: "var(--cr-red)", color: "#fff", border: "none" }}
          >
            Excluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* Delete Confirmation */}
    <AlertDialog
      open={!!deletingPost}
      onOpenChange={(open) => !open && setDeletingPost(null)}
    >
      <AlertDialogContent
        style={{
          background: "var(--cr-dialog-bg)",
          border: "1px solid var(--cr-border)",
          fontFamily: f,
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle style={{ color: "var(--cr-text-1)" }}>
            Excluir post?
          </AlertDialogTitle>
          <AlertDialogDescription style={{ color: "var(--cr-text-2)" }}>
            Este post sera removido permanentemente. Esta acao nao pode ser desfeita.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            style={{
              border: "1px solid var(--cr-border)",
              color: "var(--cr-text-2)",
              background: "transparent",
            }}
          >
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDeletePost}
            style={{ background: "var(--cr-red)", color: "#fff", border: "none" }}
          >
            Excluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
