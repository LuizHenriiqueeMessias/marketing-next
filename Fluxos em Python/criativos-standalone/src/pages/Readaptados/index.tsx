import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import {
  Repeat2,
  Pencil,
  Loader2,
  ChevronRight,
  ExternalLink,
  Copy,
  TrendingUp,
  Eye,
  Heart,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
  Download,
  MessageCircle,
  Trash2,
  Hash,
  Lightbulb,
  Sparkles,
  FileText,
  CalendarDays,
  MessageSquare,
  Inbox,
  Target,
  Zap,
  LayoutList,
  Send,
  Video,
  Image,
  LayoutGrid,
  CheckSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToolLogger } from "@/hooks/useToolLogger";
import EditMetricsDialog, { type ReadaptedPost } from "./EditMetricsDialog";

type SortKey = "score_relevancia" | "curtidas" | "visualizacoes";

interface ParsedReadaptacao {
  analise: string | null;
  formatoSugerido: string | null;
  hook: string | null;
  roteiro: string | null;
  legendaCta: string | null;
}

function parseReadaptacao(md: string | null): ParsedReadaptacao | null {
  if (!md) return null;

  const sectionPatterns = [
    { key: "formatoSugerido" as const, marker: /🎯\s*\*{0,2}FORMATO SUGERIDO\*{0,2}/i },
    { key: "hook" as const, marker: /🪝\s*\*{0,2}HOOK/i },
    { key: "roteiro" as const, marker: /📝\s*\*{0,2}ROTEIRO/i },
    { key: "legendaCta" as const, marker: /📲\s*\*{0,2}LEGENDA\s*\+?\s*CTA/i },
  ];

  // Find positions of each section
  const positions: { key: keyof Omit<ParsedReadaptacao, "analise">; start: number }[] = [];
  for (const sp of sectionPatterns) {
    const match = md.search(sp.marker);
    if (match !== -1) positions.push({ key: sp.key, start: match });
  }
  positions.sort((a, b) => a.start - b.start);

  if (positions.length === 0) return null;

  // Everything before the first section marker is the analysis
  const analise = md.slice(0, positions[0].start).replace(/---\s*$/, "").trim() || null;

  const result: ParsedReadaptacao = {
    analise,
    formatoSugerido: null,
    hook: null,
    roteiro: null,
    legendaCta: null,
  };

  for (let i = 0; i < positions.length; i++) {
    const end = i + 1 < positions.length ? positions[i + 1].start : md.length;
    const content = md.slice(positions[i].start, end).replace(/---\s*$/, "").trim();
    result[positions[i].key] = content;
  }

  return result;
}

function getMediaBadgeStyle(type: string | null) {
  const t = (type || "").toLowerCase();
  if (t === "video" || t === "reel") {
    return {
      bg: "var(--cr-badge-video-bg)",
      color: "var(--cr-badge-video-color)",
      border: "var(--cr-badge-video-border)",
      icon: Video,
      label: type || "post",
    };
  }
  if (t === "carousel" || t === "sidecar") {
    return {
      bg: "var(--cr-badge-carousel-bg)",
      color: "var(--cr-badge-carousel-color)",
      border: "var(--cr-badge-carousel-border)",
      icon: LayoutGrid,
      label: "Carrossel",
    };
  }
  // image / default
  return {
    bg: "var(--cr-badge-image-bg)",
    color: "var(--cr-badge-image-color)",
    border: "var(--cr-badge-image-border)",
    icon: Image,
    label: type || "post",
  };
}

function UserChip({ name }: { name: string }) {
  const initial = (name || "?").charAt(0).toUpperCase();
  return (
    <div className="flex items-center gap-1.5">
      <div
        className="w-[22px] h-[22px] rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: "var(--cr-grad)" }}
      >
        <span className="text-[9px] font-bold text-white">{initial}</span>
      </div>
      <span className="text-xs truncate" style={{ color: "var(--cr-text-2)" }}>{name}</span>
    </div>
  );
}

const rowVariants = {
  hidden: { opacity: 0, y: 6 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.04, duration: 0.2 },
  }),
};

interface ReadaptadosProps {
  profileId?: string;
}

function ScoreBar({ score }: { score: number | null }) {
  if (score == null) return <span style={{ color: "var(--cr-text-3)", fontSize: "12px" }}>{"\u2014"}</span>;
  const color = score >= 8 ? "var(--cr-score-high)" : score >= 6 ? "var(--cr-score-mid)" : "var(--cr-score-low)";
  const pct = Math.min(100, (score / 10) * 100);
  return (
    <div className="flex items-center gap-2 justify-center">
      <div className="w-12 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
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
      style={{ background: "var(--cr-surface)", border: "1px solid var(--cr-border)" }}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: bgColor }}>
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

// KPI card with distinct color per metric
function KpiCard({
  icon: Icon,
  label,
  value,
  color,
  bgColor,
  gradient,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  color: string;
  bgColor: string;
  gradient?: boolean;
}) {
  return (
    <div
      className="relative rounded-[14px] p-[18px_20px] overflow-hidden transition-[border-color] duration-200 group"
      style={{ background: "var(--cr-surface-2)", border: "1px solid var(--cr-border)" }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--cr-border-hover)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--cr-border)"; }}
    >
      {/* Gradient overlay on hover */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-50 transition-opacity duration-200 pointer-events-none"
        style={{ background: "var(--cr-grad-soft)" }}
      />
      <div className="relative z-[1]">
        <div className="flex items-center gap-2 mb-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--cr-border)" }}
          >
            <Icon className="w-4 h-4" style={{ color: "var(--cr-text-3)" }} />
          </div>
        </div>
        <p
          className="text-[28px] font-extrabold tabular-nums tracking-[-0.02em] leading-none"
          style={gradient
            ? { background: "var(--cr-grad)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", fontFamily: "'Outfit', sans-serif" }
            : { color: "var(--cr-text-1)", fontFamily: "'Outfit', sans-serif" }
          }
        >
          {value}
        </p>
        <p className="text-[11px] font-medium mt-1" style={{ color: "var(--cr-text-3)" }}>
          {label}
        </p>
      </div>
    </div>
  );
}

export default function Readaptados({ profileId }: ReadaptadosProps = {}) {
  const { log } = useToolLogger();
  const [posts, setPosts] = useState<ReadaptedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [editingPost, setEditingPost] = useState<ReadaptedPost | null>(null);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [searchQuery, setSearchQuery] = useState("");
  const [deletingPost, setDeletingPost] = useState<ReadaptedPost | null>(null);
  const [expandedTranscricoes, setExpandedTranscricoes] = useState<Set<string>>(new Set());
  const [selectedPosts, setSelectedPosts] = useState<Set<string>>(new Set());
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const fetchPosts = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("readapted_posts")
        .select("*, inspiration_posts!readapted_posts_inspiration_post_id_fkey(analysis, post_url)")
        .order("created_at", { ascending: false });

      if (profileId) {
        query = query.eq("profile_id", profileId);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Merge analysis from inspiration_posts into readapted_posts fields
      const merged = (data || []).map((row: any) => {
        let analysis = row.inspiration_posts?.analysis ?? null;
        if (typeof analysis === "string") {
          try { analysis = JSON.parse(analysis); } catch { analysis = null; }
        }

        return {
          ...row,
          inspiration_posts: undefined,
          tema: row.tema || analysis?.tema || null,
          gancho: row.gancho || analysis?.gancho || null,
          sugestao_readaptacao: row.sugestao_readaptacao || analysis?.sugestao_readaptacao || null,
          score_relevancia: row.score_relevancia ?? analysis?.score_relevancia ?? null,
          inspiration_analysis: analysis,
          inspiration_post_url: row.inspiration_posts?.post_url ?? null,
        } as ReadaptedPost;
      });

      // Fetch profile info for usuario column
      const profileIds = [...new Set(merged.map((p) => p.profile_id).filter(Boolean))];
      let profileMap: Record<string, { client_name: string; own_instagram: string }> = {};
      if (profileIds.length > 0) {
        const { data: profiles } = await supabase
          .from("inspiration_profiles")
          .select("id, client_name, own_instagram")
          .in("id", profileIds);
        if (profiles) {
          profileMap = Object.fromEntries(profiles.map((p) => [p.id, p]));
        }
      }

      // Enrich with profile data and transcricao fallback
      const isTemplateLiteral = (v: string | null | undefined) =>
        !v || v.startsWith("{{") || v.startsWith("$json") || v.startsWith("$('");
      const enriched = merged.map((post) => {
        const profileInfo = profileMap[post.profile_id];
        const rawName = post.client_name;
        const resolvedName = isTemplateLiteral(rawName)
          ? (profileInfo?.client_name || (profileInfo?.own_instagram ? "@" + profileInfo.own_instagram : "") || "\u2014")
          : rawName;
        return {
          ...post,
          client_name: resolvedName,
          transcricao: post.transcricao || (post as any).inspiration_analysis?.transcricao || (post as any).inspiration_analysis?.transcription || null,
        };
      });

      setPosts(enriched);
    } catch (err: any) {
      toast.error(err.message || "Erro ao buscar posts readaptados");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPosts();
  }, []);

  const clients = useMemo(
    () => [...new Set(posts.map((p) => p.client_name).filter((n) => Boolean(n) && n !== "\u2014"))].sort(),
    [posts]
  );

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const filtered = useMemo(() => {
    let result = posts.filter((p) => {
      if (clientFilter !== "all" && p.client_name !== clientFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesTema = (p.tema || "").toLowerCase().includes(q);
        const matchesGancho = (p.gancho || "").toLowerCase().includes(q);
        const matchesLink = (p.original_post_url || "").toLowerCase().includes(q)
          || (p.inspiration_post_url || "").toLowerCase().includes(q);
        if (!matchesTema && !matchesGancho && !matchesLink) return false;
      }
      return true;
    });

    if (sortKey) {
      result = [...result].sort((a, b) => {
        const av = a[sortKey] ?? null;
        const bv = b[sortKey] ?? null;
        if (av === null && bv === null) return 0;
        if (av === null) return 1;
        if (bv === null) return -1;
        const diff = (av as number) - (bv as number);
        return sortDir === "desc" ? -diff : diff;
      });
    }

    return result;
  }, [posts, clientFilter, searchQuery, sortKey, sortDir]);

  // Selection helpers
  const isAllSelected = filtered.length > 0 && filtered.every(p => selectedPosts.has(p.id));
  const isSomeSelected = selectedPosts.size > 0;

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedPosts(new Set());
    } else {
      setSelectedPosts(new Set(filtered.map(p => p.id)));
    }
  };

  const toggleSelectPost = (id: string) => {
    setSelectedPosts(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Clear selection when filters change
  useEffect(() => {
    setSelectedPosts(new Set());
  }, [clientFilter, searchQuery]);

  // KPIs
  const kpiTotalReadaptados = filtered.length;
  const kpiScoreMedio = useMemo(() => {
    const valid = filtered.filter((p) => p.score_relevancia != null);
    if (valid.length === 0) return null;
    return valid.reduce((sum, p) => sum + p.score_relevancia!, 0) / valid.length;
  }, [filtered]);
  const kpiTotalViews = useMemo(
    () => filtered.reduce((sum, p) => sum + (p.visualizacoes || 0), 0),
    [filtered]
  );
  const kpiTotalCurtidas = useMemo(
    () => filtered.reduce((sum, p) => sum + (p.curtidas || 0), 0),
    [filtered]
  );

  const handleSave = async (
    id: string,
    data: { curtidas: number; envios: number; visualizacoes: number }
  ) => {
    try {
      const { error } = await supabase
        .from("readapted_posts")
        .update(data)
        .eq("id", id);

      if (error) throw error;
      toast.success("Metricas atualizadas");
      log({ toolId: "criativos-readaptados", actionType: "record_update", actionDetail: `Atualizou métricas — curtidas: ${data.curtidas}, envios: ${data.envios}, views: ${data.visualizacoes}`, metadata: { postId: id, ...data } });
      setEditingPost(null);
      setPosts((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...data } : p))
      );
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar metricas");
    }
  };

  const handleSaveObservacoes = async (post: ReadaptedPost, value: string) => {
    if (value === (post.observacoes || "")) return;
    try {
      const { error } = await supabase
        .from("readapted_posts")
        .update({ observacoes: value })
        .eq("id", post.id);
      if (error) throw error;
      setPosts((prev) =>
        prev.map((p) => (p.id === post.id ? { ...p, observacoes: value } : p))
      );
      toast.success("Salvo");
      log({ toolId: "criativos-readaptados", actionType: "record_update", actionDetail: `Salvou observações (${value.length} caracteres)`, metadata: { postId: post.id, observacoesLength: value.length } });
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar observacoes");
    }
  };

  const handleDelete = async () => {
    if (!deletingPost) return;
    try {
      const { error: delErr } = await supabase
        .from("readapted_posts")
        .delete()
        .eq("id", deletingPost.id);
      if (delErr) throw delErr;

      await supabase
        .from("inspiration_posts")
        .update({ readapted: false })
        .eq("id", deletingPost.inspiration_post_id);

      setPosts((prev) => prev.filter((p) => p.id !== deletingPost.id));
      toast.success("Post excluido");
      log({ toolId: "criativos-readaptados", actionType: "record_delete", actionDetail: `Excluiu post readaptado`, metadata: { postId: deletingPost.id, inspirationPostId: deletingPost.inspiration_post_id } });
      setDeletingPost(null);
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir post");
    }
  };

  const handleBulkDelete = async () => {
    if (selectedPosts.size === 0) return;
    setBulkDeleting(true);
    try {
      const idsToDelete = Array.from(selectedPosts);
      const postsToDelete = posts.filter(p => idsToDelete.includes(p.id));

      // Delete all selected readapted_posts
      const { error: delErr } = await supabase
        .from("readapted_posts")
        .delete()
        .in("id", idsToDelete);
      if (delErr) throw delErr;

      // Reset readapted flag on inspiration_posts for each
      const inspirationIds = postsToDelete
        .map(p => p.inspiration_post_id)
        .filter(Boolean);
      if (inspirationIds.length > 0) {
        await supabase
          .from("inspiration_posts")
          .update({ readapted: false })
          .in("id", inspirationIds);
      }

      setPosts(prev => prev.filter(p => !selectedPosts.has(p.id)));
      toast.success(`${idsToDelete.length} post(s) excluido(s)`);
      log({
        toolId: "criativos-readaptados",
        actionType: "record_delete",
        actionDetail: `Excluiu ${idsToDelete.length} posts readaptados em lote`,
        metadata: { postIds: idsToDelete, count: idsToDelete.length },
      });
      setSelectedPosts(new Set());
      setShowBulkDeleteDialog(false);
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir posts");
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleExportCSV = () => {
    const escapeField = (v: string | number | null | undefined) => {
      const s = String(v ?? "");
      return s.includes(",") ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const headers = [
      "Tipo", "Usuario", "Tema", "Gancho", "Score", "Curtidas",
      "Envios", "Views", "Sugestao Readaptacao", "Caption Original",
      "URL Original", "Data Criacao",
    ];

    const rows = filtered.map((p) => [
      escapeField(p.media_type),
      escapeField(p.client_name),
      escapeField(p.tema),
      escapeField(p.gancho),
      escapeField(p.score_relevancia),
      escapeField(p.curtidas),
      escapeField(p.envios),
      escapeField(p.visualizacoes),
      escapeField(p.sugestao_readaptacao),
      escapeField(p.original_caption),
      escapeField(p.original_post_url),
      escapeField(new Date(p.created_at).toLocaleDateString("pt-BR")),
    ]);

    const csv =
      "\uFEFF" +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const today = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `readaptados_export_${today}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    log({ toolId: "criativos-readaptados", actionType: "data_export", actionDetail: `Exportou CSV com ${filtered.length} posts readaptados`, metadata: { rowCount: filtered.length, fileName: a.download } });
  };

  const renderSortIcon = (key: SortKey) => {
    if (sortKey !== key) return <ArrowUpDown className="w-3 h-3 inline ml-1" style={{ color: "var(--cr-text-3)" }} />;
    return sortDir === "desc"
      ? <ArrowDown className="w-3 h-3 inline ml-1" style={{ color: "var(--cr-accent)" }} />
      : <ArrowUp className="w-3 h-3 inline ml-1" style={{ color: "var(--cr-accent)" }} />;
  };

  const f = "var(--cr-font)";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="flex-1 p-8 overflow-y-auto min-h-full bg-background"
      style={{ fontFamily: f }}
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
      <div className="max-w-7xl mx-auto space-y-6 relative z-[1]">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <div
              className="w-10 h-10 rounded-[10px] flex items-center justify-center flex-shrink-0"
              style={{ background: "var(--cr-grad-soft)", border: "1px solid rgba(232,96,74, 0.25)" }}
            >
              <Repeat2 className="w-[18px] h-[18px]" style={{ color: "rgba(232,96,74, 0.9)" }} />
            </div>
            <h1
              className="text-xl font-bold tracking-[-0.02em]"
              style={{ color: "var(--cr-text-1)", fontFamily: "'Outfit', sans-serif" }}
            >
              Posts Readaptados
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {isSomeSelected && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowBulkDeleteDialog(true)}
                className="text-[12px] font-semibold gap-1.5"
                style={{
                  background: "rgba(232,84,84,0.08)",
                  border: "1px solid rgba(232,84,84,0.25)",
                  color: "#e85454",
                  fontFamily: f,
                  borderRadius: "var(--cr-radius-sm)",
                  padding: "7px 14px",
                }}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Excluir ({selectedPosts.size})
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              className="text-[12px] font-semibold gap-1.5"
              style={{
                background: "transparent",
                border: "1px solid var(--cr-border-hover)",
                color: "var(--cr-text-2)",
                fontFamily: f,
                borderRadius: "var(--cr-radius-sm)",
                padding: "7px 14px",
              }}
            >
              <Download className="w-3.5 h-3.5" />
              Exportar
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={clientFilter} onValueChange={setClientFilter}>
            <SelectTrigger
              className="w-48 text-[13px] h-9"
              style={{
                background: "var(--cr-surface)",
                border: "1px solid var(--cr-border)",
                color: "var(--cr-text-1)",
                fontFamily: f,
                borderRadius: "var(--cr-radius)",
              }}
            >
              <SelectValue placeholder="Usuario" />
            </SelectTrigger>
            <SelectContent
              style={{
                background: "var(--cr-dialog-bg)",
                border: "1px solid var(--cr-border)",
                fontFamily: f,
              }}
            >
              <SelectItem value="all">Todos os usuarios</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
              style={{ color: "var(--cr-text-3)" }}
            />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por tema, gancho ou link..."
              className="w-64 pl-9 h-9 text-[13px]"
              style={{
                background: "var(--cr-surface)",
                border: "1px solid var(--cr-border)",
                color: "var(--cr-text-1)",
                fontFamily: f,
                borderRadius: "var(--cr-radius)",
              }}
            />
          </div>
        </div>

        {/* KPI Dashboard — each card has a unique color */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard
            icon={Repeat2}
            label="Total Readaptados"
            value={kpiTotalReadaptados.toLocaleString("pt-BR")}
            color="var(--cr-accent)"
            bgColor="var(--cr-accent-muted)"
          />
          <KpiCard
            icon={TrendingUp}
            label="Score Medio"
            value={kpiScoreMedio != null ? kpiScoreMedio.toFixed(1) : "\u2014"}
            color="var(--cr-amber)"
            bgColor="var(--cr-amber-muted)"
            gradient
          />
          <KpiCard
            icon={Eye}
            label="Total Views"
            value={kpiTotalViews.toLocaleString("pt-BR")}
            color="var(--cr-blue)"
            bgColor="var(--cr-blue-muted)"
          />
          <KpiCard
            icon={Heart}
            label="Total Curtidas"
            value={kpiTotalCurtidas.toLocaleString("pt-BR")}
            color="var(--cr-green)"
            bgColor="var(--cr-green-muted)"
          />
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--cr-text-3)" }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: "var(--cr-surface)" }}
            >
              <Inbox className="w-4 h-4" style={{ color: "var(--cr-text-3)" }} />
            </div>
            <p className="text-[13px]" style={{ color: "var(--cr-text-3)" }}>
              Nenhum post readaptado encontrado.
            </p>
          </div>
        ) : (
          <div
            className="rounded-[14px] overflow-hidden"
            style={{ background: "var(--cr-surface-2)", border: "1px solid var(--cr-border)" }}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--cr-border)", background: "var(--cr-surface)" }}>
                    <th className="w-10 px-3 py-3 text-center" style={{ color: "var(--cr-text-3)" }}>
                      <Checkbox
                        checked={isAllSelected}
                        onCheckedChange={toggleSelectAll}
                        className="border-white/20 data-[state=checked]:bg-[var(--cr-accent)] data-[state=checked]:border-[var(--cr-accent)]"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </th>
                    <th className="text-left font-medium px-4 py-3" style={{ color: "var(--cr-text-3)" }}>Tipo</th>
                    <th className="text-left font-medium px-4 py-3" style={{ color: "var(--cr-text-3)" }}>Usuario</th>
                    <th className="text-left font-medium px-4 py-3" style={{ color: "var(--cr-text-3)" }}>Tema</th>
                    <th className="text-left font-medium px-4 py-3" style={{ color: "var(--cr-text-3)" }}>Gancho</th>
                    <th
                      className="text-center font-medium px-4 py-3 cursor-pointer select-none transition-colors"
                      style={{ color: "var(--cr-text-3)" }}
                      onClick={() => toggleSort("score_relevancia")}
                    >
                      Score{renderSortIcon("score_relevancia")}
                    </th>
                    <th
                      className="text-center font-medium px-4 py-3 cursor-pointer select-none transition-colors"
                      style={{ color: "var(--cr-text-3)" }}
                      onClick={() => toggleSort("curtidas")}
                    >
                      Curtidas{renderSortIcon("curtidas")}
                    </th>
                    <th className="text-center font-medium px-4 py-3" style={{ color: "var(--cr-text-3)" }}>Envios</th>
                    <th
                      className="text-center font-medium px-4 py-3 cursor-pointer select-none transition-colors"
                      style={{ color: "var(--cr-text-3)" }}
                      onClick={() => toggleSort("visualizacoes")}
                    >
                      Views{renderSortIcon("visualizacoes")}
                    </th>
                    <th className="text-center font-medium px-4 py-3" style={{ color: "var(--cr-text-3)" }}>Scrappeado</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((post, index) => {
                    const isExpanded = expandedPostId === post.id;
                    return (
                      <React.Fragment key={post.id}>
                        <motion.tr
                          custom={index}
                          variants={rowVariants}
                          initial="hidden"
                          animate="visible"
                          onClick={() => setExpandedPostId(isExpanded ? null : post.id)}
                          className="transition-colors cursor-pointer group/row"
                          style={{
                            borderBottom: "1px solid var(--cr-border)",
                            background: isExpanded ? "var(--cr-surface-active)" : "transparent",
                          }}
                          onMouseEnter={(e) => {
                            if (!isExpanded) (e.currentTarget as HTMLElement).style.background = "var(--cr-surface-hover)";
                          }}
                          onMouseLeave={(e) => {
                            if (!isExpanded) (e.currentTarget as HTMLElement).style.background = "transparent";
                          }}
                        >
                          <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selectedPosts.has(post.id)}
                              onCheckedChange={() => toggleSelectPost(post.id)}
                              className="border-white/20 data-[state=checked]:bg-[var(--cr-accent)] data-[state=checked]:border-[var(--cr-accent)]"
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
                                  {badge.label}
                                </span>
                              );
                            })()}
                          </td>
                          <td className="px-4 py-3">
                            <UserChip name={post.client_name} />
                          </td>
                          <td className="px-4 py-3 max-w-[140px]">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="block truncate" style={{ color: "var(--cr-text-2)" }}>
                                    {post.tema || "\u2014"}
                                  </span>
                                </TooltipTrigger>
                                {post.tema && (
                                  <TooltipContent
                                    style={{ background: "var(--cr-surface-4)", border: "1px solid var(--cr-border-hover)", borderRadius: "6px" }}
                                  >
                                    <p className="text-xs max-w-xs" style={{ color: "var(--cr-text-1)" }}>{post.tema}</p>
                                  </TooltipContent>
                                )}
                              </Tooltip>
                            </TooltipProvider>
                          </td>
                          <td className="px-4 py-3 max-w-[140px]">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="block truncate" style={{ color: "var(--cr-text-2)" }}>
                                    {post.gancho || "\u2014"}
                                  </span>
                                </TooltipTrigger>
                                {post.gancho && (
                                  <TooltipContent
                                    style={{ background: "var(--cr-surface-4)", border: "1px solid var(--cr-border-hover)", borderRadius: "6px" }}
                                  >
                                    <p className="text-xs max-w-xs" style={{ color: "var(--cr-text-1)" }}>{post.gancho}</p>
                                  </TooltipContent>
                                )}
                              </Tooltip>
                            </TooltipProvider>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <ScoreBar score={post.score_relevancia} />
                          </td>
                          <td className="px-4 py-3 text-center tabular-nums" style={{ color: "var(--cr-text-2)" }}>
                            {post.curtidas}
                          </td>
                          <td className="px-4 py-3 text-center tabular-nums" style={{ color: "var(--cr-text-2)" }}>
                            {post.envios}
                          </td>
                          <td className="px-4 py-3 text-center tabular-nums" style={{ color: "var(--cr-text-2)" }}>
                            {post.visualizacoes}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex flex-col items-center">
                              <span className="text-xs tabular-nums" style={{ color: "var(--cr-text-2)" }}>
                                {new Date(post.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                              </span>
                              <span className="text-[10px] tabular-nums" style={{ color: "var(--cr-text-3)" }}>
                                {new Date(post.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </div>
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
                        </motion.tr>

                        <AnimatePresence>
                          {isExpanded && (
                            <tr key={`${post.id}-expanded`}>
                              <td colSpan={11} className="p-0" style={{ borderTop: "1px solid var(--cr-border)" }}>
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: "auto" }}
                                  exit={{ opacity: 0, height: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="overflow-hidden"
                                >
                                  <div className="p-5 space-y-4">
                                    {/* Analysis cards */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                      <AnalysisCard icon={Hash} label="Tema" color="var(--cr-violet)" bgColor="var(--cr-violet-muted)">
                                        <p className="text-sm font-medium" style={{ color: "var(--cr-text-1)" }}>
                                          {post.tema || "--"}
                                        </p>
                                      </AnalysisCard>

                                      <AnalysisCard icon={Lightbulb} label="Gancho" color="var(--cr-amber)" bgColor="var(--cr-amber-muted)">
                                        <p className="text-sm font-medium" style={{ color: "var(--cr-text-1)" }}>
                                          {post.gancho || "--"}
                                        </p>
                                      </AnalysisCard>

                                      <AnalysisCard icon={TrendingUp} label="Score & Info" color="var(--cr-cyan)" bgColor="var(--cr-cyan-muted)">
                                        <div className="flex items-center gap-3">
                                          <ScoreBar score={post.score_relevancia} />
                                          <span className="text-[10px] flex items-center gap-1" style={{ color: "var(--cr-text-3)" }}>
                                            <CalendarDays className="w-3 h-3" />
                                            {new Date(post.created_at).toLocaleDateString("pt-BR")}
                                          </span>
                                        </div>
                                      </AnalysisCard>
                                    </div>

                                    {/* Caption */}
                                    {post.original_caption && (
                                      <div
                                        className="relative rounded-xl overflow-hidden"
                                        style={{ background: "var(--cr-surface)", border: "1px solid var(--cr-border)" }}
                                      >
                                        <div className="absolute left-0 top-0 bottom-0 w-[2px]" style={{ background: "var(--cr-border-active)" }} />
                                        <div className="pl-5 pr-4 py-4">
                                          <div className="flex items-center gap-2 mb-2">
                                            <FileText className="w-3.5 h-3.5" style={{ color: "var(--cr-text-3)" }} />
                                            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--cr-text-3)" }}>
                                              Caption Original
                                            </span>
                                          </div>
                                          <p className="text-sm leading-relaxed" style={{ color: "var(--cr-text-2)" }}>
                                            {post.original_caption}
                                          </p>
                                        </div>
                                      </div>
                                    )}

                                    {/* Transcricao (video/reel) */}
                                    {post.transcricao && (() => {
                                      const isExpanded = expandedTranscricoes.has(post.id);
                                      const isLong = post.transcricao.length > 200;
                                      return (
                                      <div
                                        className="relative rounded-xl overflow-hidden"
                                        style={{ background: "var(--cr-surface)", border: "1px solid var(--cr-border)" }}
                                      >
                                        <div className="absolute left-0 top-0 bottom-0 w-[2px]" style={{ background: "var(--cr-cyan)" }} />
                                        <div className="pl-5 pr-4 py-4">
                                          <div className="flex items-center gap-2 mb-2">
                                            <FileText className="w-3.5 h-3.5" style={{ color: "var(--cr-cyan)" }} />
                                            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--cr-cyan)" }}>
                                              Transcrição
                                            </span>
                                          </div>
                                          <p
                                            className={`text-sm leading-relaxed whitespace-pre-wrap ${isLong && !isExpanded ? "line-clamp-3" : ""}`}
                                            style={{ color: "var(--cr-text-2)" }}
                                          >
                                            {post.transcricao}
                                          </p>
                                          {isLong && (
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setExpandedTranscricoes(prev => {
                                                  const next = new Set(prev);
                                                  if (next.has(post.id)) next.delete(post.id);
                                                  else next.add(post.id);
                                                  return next;
                                                });
                                              }}
                                              className="text-[11px] mt-1 cursor-pointer hover:underline"
                                              style={{ color: "var(--cr-cyan)" }}
                                            >
                                              {isExpanded ? "ver menos" : "... ver mais"}
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                      );
                                    })()}

                                    {/* Conteudo readaptado */}
                                    {(() => {
                                      const parsed = parseReadaptacao(post.sugestao_readaptacao);
                                      const mdClasses = "prose prose-invert prose-sm max-w-none prose-headings:text-white prose-headings:font-semibold prose-h1:text-base prose-h1:mt-4 prose-h1:mb-2 prose-h2:text-sm prose-h2:mt-3 prose-h2:mb-1.5 prose-p:text-white/75 prose-p:text-sm prose-p:leading-relaxed prose-p:my-1.5 prose-strong:text-white/90 prose-li:text-white/70 prose-li:text-sm prose-hr:border-white/10 prose-hr:my-3";

                                      if (!parsed) {
                                        // Fallback: show raw markdown or empty state
                                        return (
                                          <div
                                            className="relative rounded-xl overflow-hidden"
                                            style={{ background: "var(--cr-accent-muted)", border: "1px solid var(--cr-accent-border)" }}
                                          >
                                            <div className="absolute left-0 top-0 bottom-0 w-[2px]" style={{ background: "var(--cr-accent)" }} />
                                            <div className="pl-5 pr-4 py-4">
                                              <div className="flex items-center gap-2 mb-2">
                                                <Sparkles className="w-3.5 h-3.5" style={{ color: "var(--cr-accent)" }} />
                                                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--cr-accent)" }}>
                                                  Conteudo Readaptado
                                                </span>
                                              </div>
                                              {post.sugestao_readaptacao ? (
                                                <div className={mdClasses}>
                                                  <ReactMarkdown>{post.sugestao_readaptacao}</ReactMarkdown>
                                                </div>
                                              ) : (
                                                <p className="text-sm" style={{ color: "var(--cr-text-3)" }}>Sem sugestao</p>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      }

                                      const sections = [
                                        { key: "formatoSugerido" as const, icon: Target, label: "Formato Sugerido", color: "var(--cr-violet)", bgColor: "var(--cr-violet-muted)", borderColor: "var(--cr-violet)" },
                                        { key: "hook" as const, icon: Zap, label: "Hook", color: "var(--cr-amber)", bgColor: "var(--cr-amber-muted)", borderColor: "var(--cr-amber)" },
                                        { key: "roteiro" as const, icon: LayoutList, label: "Roteiro / Corpo", color: "var(--cr-cyan)", bgColor: "var(--cr-cyan-muted)", borderColor: "var(--cr-cyan)" },
                                        { key: "legendaCta" as const, icon: Send, label: "Legenda + CTA", color: "var(--cr-green)", bgColor: "var(--cr-green-muted)", borderColor: "var(--cr-green)" },
                                      ];

                                      return (
                                        <div className="space-y-3">
                                          {/* Header with copy button */}
                                          <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                              <Sparkles className="w-4 h-4" style={{ color: "var(--cr-accent)" }} />
                                              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cr-accent)" }}>
                                                Conteudo Readaptado
                                              </span>
                                            </div>
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className="h-6 px-2 text-[10px]"
                                              style={{ color: "var(--cr-accent)" }}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                navigator.clipboard.writeText(post.sugestao_readaptacao!);
                                                toast.success("Copiado!");
                                              }}
                                            >
                                              <Copy className="w-3 h-3 mr-1" />
                                              Copiar tudo
                                            </Button>
                                          </div>

                                          {/* Analise (collapsible context) */}
                                          {parsed.analise && (
                                            <details
                                              className="rounded-xl overflow-hidden group"
                                              style={{ background: "var(--cr-surface)", border: "1px solid var(--cr-border)" }}
                                            >
                                              <summary
                                                className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none text-[11px] font-semibold uppercase tracking-wider"
                                                style={{ color: "var(--cr-text-3)" }}
                                              >
                                                <FileText className="w-3.5 h-3.5" />
                                                Analise do Conteudo de Referencia
                                                <ChevronRight className="w-3 h-3 ml-auto transition-transform group-open:rotate-90" />
                                              </summary>
                                              <div className="px-4 pb-4">
                                                <div className={mdClasses}>
                                                  <ReactMarkdown>{parsed.analise}</ReactMarkdown>
                                                </div>
                                              </div>
                                            </details>
                                          )}

                                          {/* Section cards grid */}
                                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {sections.map((sec) => {
                                              const content = parsed[sec.key];
                                              if (!content) return null;
                                              const SIcon = sec.icon;
                                              return (
                                                <div
                                                  key={sec.key}
                                                  className="relative rounded-xl overflow-hidden"
                                                  style={{ background: sec.bgColor, border: `1px solid color-mix(in srgb, ${sec.color} 25%, transparent)` }}
                                                >
                                                  <div className="absolute left-0 top-0 bottom-0 w-[2px]" style={{ background: sec.color }} />
                                                  <div className="pl-5 pr-4 py-4">
                                                    <div className="flex items-center justify-between mb-3">
                                                      <div className="flex items-center gap-2">
                                                        <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: `color-mix(in srgb, ${sec.color} 20%, transparent)` }}>
                                                          <SIcon className="w-3 h-3" style={{ color: sec.color }} />
                                                        </div>
                                                        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: sec.color }}>
                                                          {sec.label}
                                                        </span>
                                                      </div>
                                                      <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-5 px-1.5 text-[9px] opacity-60 hover:opacity-100"
                                                        style={{ color: sec.color }}
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          navigator.clipboard.writeText(content);
                                                          toast.success("Secao copiada!");
                                                        }}
                                                      >
                                                        <Copy className="w-2.5 h-2.5" />
                                                      </Button>
                                                    </div>
                                                    <div className={mdClasses}>
                                                      <ReactMarkdown>{content}</ReactMarkdown>
                                                    </div>
                                                  </div>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      );
                                    })()}

                                    {/* Observacoes */}
                                    <div
                                      className="relative rounded-xl overflow-hidden"
                                      style={{ background: "var(--cr-surface)", border: "1px solid var(--cr-border)" }}
                                    >
                                      <div className="absolute left-0 top-0 bottom-0 w-[2px]" style={{ background: "var(--cr-blue-muted)" }} />
                                      <div className="pl-5 pr-4 py-4">
                                        <div className="flex items-center gap-2 mb-2">
                                          <MessageSquare className="w-3.5 h-3.5" style={{ color: "var(--cr-blue)" }} />
                                          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--cr-blue)" }}>
                                            Observacoes
                                          </span>
                                        </div>
                                        <Textarea
                                          className="text-sm resize-none min-h-[60px]"
                                          style={{
                                            background: "var(--cr-surface-hover)",
                                            border: "1px solid var(--cr-border)",
                                            color: "var(--cr-text-2)",
                                            fontFamily: f,
                                            borderRadius: "var(--cr-radius)",
                                          }}
                                          defaultValue={post.observacoes || ""}
                                          placeholder="Adicionar observacoes..."
                                          onClick={(e) => e.stopPropagation()}
                                          onBlur={(e) => handleSaveObservacoes(post, e.target.value)}
                                        />
                                      </div>
                                    </div>

                                    {/* Action links */}
                                    <div className="flex items-center gap-4 pt-1">
                                      <button
                                        className="inline-flex items-center gap-1.5 text-sm font-medium transition-opacity hover:opacity-70"
                                        style={{ color: "var(--cr-text-2)" }}
                                        onClick={(e) => { e.stopPropagation(); setEditingPost(post); }}
                                      >
                                        <Pencil className="w-3.5 h-3.5" />
                                        Editar metricas
                                      </button>
                                      <button
                                        className="inline-flex items-center gap-1.5 text-sm font-medium transition-opacity hover:opacity-70"
                                        style={{ color: "var(--cr-score-low)" }}
                                        onClick={(e) => { e.stopPropagation(); setDeletingPost(post); }}
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        Excluir
                                      </button>
                                      {post.original_post_url && (
                                        <a
                                          href={post.original_post_url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          onClick={(e) => e.stopPropagation()}
                                          className="inline-flex items-center gap-1.5 text-sm font-medium transition-opacity hover:opacity-70"
                                          style={{ color: "var(--cr-accent)" }}
                                        >
                                          <ExternalLink className="w-3.5 h-3.5" />
                                          Ver post original
                                        </a>
                                      )}

                                      {post.sugestao_readaptacao && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            window.open(
                                              `https://wa.me/?text=${encodeURIComponent(post.sugestao_readaptacao!)}`,
                                              "_blank"
                                            );
                                          }}
                                          className="inline-flex items-center gap-1.5 text-sm font-medium transition-opacity hover:opacity-70"
                                          style={{ color: "var(--cr-green)" }}
                                        >
                                          <MessageCircle className="w-3.5 h-3.5" />
                                          Compartilhar no WhatsApp
                                        </button>
                                      )}
                                    </div>
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
          </div>
        )}
      </div>

      <EditMetricsDialog
        post={editingPost}
        open={!!editingPost}
        onOpenChange={(open) => { if (!open) setEditingPost(null); }}
        onSave={handleSave}
      />

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deletingPost}
        onOpenChange={(open) => { if (!open) setDeletingPost(null); }}
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
              Excluir Post Readaptado
            </AlertDialogTitle>
            <AlertDialogDescription style={{ color: "var(--cr-text-2)" }}>
              Tem certeza que deseja excluir este post readaptado? Esta acao nao pode ser desfeita.
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
              onClick={handleDelete}
              style={{ background: "var(--cr-red)", color: "#fff", border: "none" }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent style={{ background: "var(--cr-dialog-bg)", border: "1px solid var(--cr-border)", fontFamily: f }}>
          <AlertDialogHeader>
            <AlertDialogTitle style={{ color: "var(--cr-text-1)" }}>
              Excluir {selectedPosts.size} post(s)?
            </AlertDialogTitle>
            <AlertDialogDescription style={{ color: "var(--cr-text-3)" }}>
              Esta acao ira excluir {selectedPosts.size} post(s) readaptado(s) permanentemente e reverter o status de readaptacao dos posts originais.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              style={{ background: "var(--cr-surface)", border: "1px solid var(--cr-border)", color: "var(--cr-text-2)" }}
              disabled={bulkDeleting}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              style={{ background: "rgba(232,84,84,0.9)", color: "white", border: "none" }}
            >
              {bulkDeleting ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> Excluindo...</>
              ) : (
                "Excluir"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
