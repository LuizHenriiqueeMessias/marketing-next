import { useEffect, useEffectEvent, useRef, useState, startTransition, type ReactNode } from "react";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  History,
  Languages,
  Link2,
  Loader2,
  Play,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { fetchBackend } from "@/lib/backendApi";
import {
  DEFAULT_RECENT_DAYS,
  RECENT_DAY_OPTIONS,
  buildOnlyPostsNewerThan,
  coerceRecentDays,
} from "@/lib/instagramScrape";

type Platform = "instagram" | "tiktok" | "youtube";
type BatchStatus = "processing" | "completed" | "partial_error" | null;
type ItemStatus = "pending" | "processing" | "success" | "error";

interface QueueItem {
  id: string;
  url: string;
  platform: Platform;
  status: ItemStatus;
  detected_language: string | null;
  transcricao_original: string | null;
  roteiro_adaptado: string | null;
  error_message: string | null;
}

interface BatchStatusResponse {
  batch_id: string;
  status: Exclude<BatchStatus, null>;
  total: number;
  completed: number;
  items: QueueItem[];
}

interface ImportProfile {
  id: string;
  client_name: string;
  own_instagram: string;
}

interface TranscriptionBatchSummary {
  id: string;
  platform: Platform;
  status: Exclude<BatchStatus, null>;
  total_items: number;
  completed_items: number;
  created_at: string;
}

interface ResolveUrlsResponse {
  urls?: string[];
  count?: number;
  total_items?: number;
}

export interface TranscritorBatchProps {
  platform: Platform;
  validateUrl: (url: string) => boolean;
  headerIcon: ReactNode;
  headerTitle: string;
  headerSub: string;
  accentColor: string;
  contentMaxWidthClassName?: string;
  centerContent?: boolean;
}

const STATUS_META: Record<
  ItemStatus,
  {
    label: string;
    background: string;
    border: string;
    color: string;
  }
> = {
  pending: {
    label: "pendente",
    background: "rgba(148,163,184,0.12)",
    border: "1px solid rgba(148,163,184,0.18)",
    color: "#cbd5e1",
  },
  processing: {
    label: "transcrevendo",
    background: "rgba(59,130,246,0.12)",
    border: "1px solid rgba(59,130,246,0.2)",
    color: "#93c5fd",
  },
  success: {
    label: "concluido",
    background: "rgba(34,197,94,0.12)",
    border: "1px solid rgba(34,197,94,0.2)",
    color: "#86efac",
  },
  error: {
    label: "erro",
    background: "rgba(239,68,68,0.12)",
    border: "1px solid rgba(239,68,68,0.2)",
    color: "#fca5a5",
  },
};

function normalizeEnteredUrl(rawUrl: string) {
  const trimmed = rawUrl.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^(www\.|instagram\.com|tiktok\.com|vm\.tiktok\.com|youtube\.com|youtu\.be)/i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

function parseUrlLines(input: string) {
  return input
    .split("\n")
    .map((line) => normalizeEnteredUrl(line))
    .filter((line) => line.length > 0);
}

function countCompletedItems(items: QueueItem[]) {
  return items.filter((item) => item.status === "success" || item.status === "error").length;
}

function formatLanguageLabel(language: string | null | undefined) {
  if (!language) return "Nao identificado";

  const normalized = language.trim().toLowerCase();
  const labels: Record<string, string> = {
    pt: "Portugues",
    "pt-br": "Portugues do Brasil",
    en: "English",
    es: "Espanol",
    fr: "Francais",
    de: "Deutsch",
    it: "Italiano",
  };

  return labels[normalized] ? `${labels[normalized]} (${normalized})` : normalized.toUpperCase();
}

function buildResultText(item: QueueItem) {
  const languageCode = (item.detected_language || "unknown").toUpperCase();
  return [
    "========================================",
    `URL: ${item.url}`,
    `Idioma detectado: ${formatLanguageLabel(item.detected_language)}`,
    "========================================",
    "",
    `TRANSCRICAO ORIGINAL (${languageCode})`,
    item.transcricao_original || "",
    "",
    "ROTEIRO ADAPTADO (PT-BR / Teleprompter)",
    item.roteiro_adaptado || "",
    "",
    "----------------------------------------",
  ].join("\n");
}

function buildConsolidatedText(items: QueueItem[]) {
  return items
    .filter((item) => item.status === "success")
    .map((item) => buildResultText(item))
    .join("\n\n");
}

function formatBatchDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data invalida";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getBatchProgressPercent(batch: TranscriptionBatchSummary) {
  if (batch.total_items <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((batch.completed_items / batch.total_items) * 100)));
}

function getBatchStatusMeta(status: Exclude<BatchStatus, null>) {
  if (status === "completed") {
    return {
      label: "Concluido",
      icon: CheckCircle2,
      className: "completed",
    };
  }

  if (status === "partial_error") {
    return {
      label: "Com erros",
      icon: AlertCircle,
      className: "partial_error",
    };
  }

  return {
    label: "Processando",
    icon: Loader2,
    className: "processing",
  };
}

async function copyToClipboard(text: string, successMessage: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(successMessage);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nao foi possivel copiar";
    toast.error(message);
  }
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

async function downloadDocxFile(filename: string, content: string) {
  const { Document, Packer, Paragraph, TextRun } = await import("docx");
  const { saveAs } = await import("file-saver");
  const paragraphs = content.split("\n").map((line) =>
    new Paragraph({ children: [new TextRun({ text: line || " ", size: 22 })] })
  );
  const doc = new Document({ sections: [{ properties: {}, children: paragraphs }] });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, filename);
}

async function downloadPdfFile(filename: string, content: string) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 40;
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();
  const maxWidth = pageWidth - margin * 2;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  const lines = doc.splitTextToSize(content, maxWidth);
  let y = margin;
  const lineHeight = 14;
  for (const line of lines) {
    if (y + lineHeight > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
    doc.text(line as string, margin, y);
    y += lineHeight;
  }
  doc.save(filename);
}

export default function TranscritorBatch({
  platform,
  validateUrl,
  headerIcon,
  headerTitle,
  headerSub,
  accentColor,
  contentMaxWidthClassName = "max-w-[1120px]",
  centerContent = false,
}: TranscritorBatchProps) {
  const { user, session, role } = useAuth();
  const [urlText, setUrlText] = useState("");
  const [items, setItems] = useState<QueueItem[]>([]);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [batchStatus, setBatchStatus] = useState<BatchStatus>(null);
  const [completedCount, setCompletedCount] = useState(0);
  const [isStarting, setIsStarting] = useState(false);
  const [importProfiles, setImportProfiles] = useState<ImportProfile[]>([]);
  const [selectedImportProfileId, setSelectedImportProfileId] = useState("");
  const [importRecentDays, setImportRecentDays] = useState(String(DEFAULT_RECENT_DAYS));
  const [importMaxPosts, setImportMaxPosts] = useState("20");
  const [isImportingRecent, setIsImportingRecent] = useState(false);
  const [historyBatches, setHistoryBatches] = useState<TranscriptionBatchSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [openingHistoryId, setOpeningHistoryId] = useState<string | null>(null);
  const completionToastRef = useRef<string | null>(null);

  const syncBatchState = useEffectEvent((payload: BatchStatusResponse) => {
    startTransition(() => {
      setItems(payload.items);
      setBatchStatus(payload.status);
      setCompletedCount(payload.completed);
    });

    if (payload.status !== "processing" && completionToastRef.current !== payload.status) {
      completionToastRef.current = payload.status;
      if (payload.status === "partial_error") {
        toast.warning("Lote finalizado com erros parciais. Os itens concluidos ja estao no documento.");
      } else {
        toast.success("Lote finalizado com sucesso.");
      }
    }
  });

  const fetchBatchStatus = useEffectEvent(async (currentBatchId: string) => {
    try {
      const query = user?.id ? `?user_id=${encodeURIComponent(user.id)}` : "";
      const response = await fetchBackend(`/transcribe/batch/${currentBatchId}${query}`, {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || data.error || `HTTP ${response.status}`);
      }

      const data = (await response.json()) as BatchStatusResponse;
      syncBatchState(data);
    } catch {
      // keep polling on transient errors
    }
  });

  const fetchInstagramImportProfiles = useEffectEvent(async () => {
    if (platform !== "instagram") return;

    try {
      let query = supabase
        .from("inspiration_profiles")
        .select("id, client_name, own_instagram")
        .order("client_name", { ascending: true });

      if (role !== "admin" && user?.id) {
        query = query.eq("user_id", user.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      const profiles = (data || []) as ImportProfile[];
      setImportProfiles(profiles);
      setSelectedImportProfileId((current) => current || profiles[0]?.id || "");
    } catch {
      // keep manual input available
    }
  });

  const fetchTranscriptionHistory = useEffectEvent(async () => {
    if (!user?.id) return;

    setHistoryLoading(true);
    try {
      const { data, error } = await supabase
        .from("transcription_batches")
        .select("id, platform, status, total_items, completed_items, created_at")
        .eq("user_id", user.id)
        .eq("platform", platform)
        .order("created_at", { ascending: false })
        .limit(8);

      if (error) throw error;
      setHistoryBatches((data || []) as TranscriptionBatchSummary[]);
    } catch {
      setHistoryBatches([]);
    } finally {
      setHistoryLoading(false);
    }
  });

  useEffect(() => {
    fetchInstagramImportProfiles();
  }, [platform, user?.id, role]);

  useEffect(() => {
    fetchTranscriptionHistory();
  }, [platform, user?.id]);

  const handleOpenHistoryBatch = async (batch: TranscriptionBatchSummary) => {
    setOpeningHistoryId(batch.id);
    completionToastRef.current = batch.status;
    setBatchId(batch.id);
    setBatchStatus(batch.status);
    setCompletedCount(batch.completed_items);
    try {
      await fetchBatchStatus(batch.id);
      setHistoryOpen(false);
    } finally {
      setOpeningHistoryId(null);
    }
  };

  const handleImportRecentVideos = async () => {
    if (platform !== "instagram") return;
    if (isQueueLocked) {
      toast.info("Clique em 'Novo lote' para montar outra fila.");
      return;
    }

    const selectedProfile = importProfiles.find((profile) => profile.id === selectedImportProfileId);
    if (!selectedProfile) {
      toast.error("Selecione um perfil");
      return;
    }

    setIsImportingRecent(true);
    try {
      const { data: targets, error } = await supabase
        .from("inspiration_targets")
        .select("instagram_url")
        .eq("profile_id", selectedProfile.id);

      if (error) throw error;

      const directUrls = Array.from(
        new Set(
          [
            selectedProfile.own_instagram,
            ...((targets || []) as { instagram_url: string }[]).map((target) => target.instagram_url),
          ]
            .map((value) => value?.trim())
            .filter(Boolean)
            .map((value) =>
              value.includes("instagram.com")
                ? value
                : `https://www.instagram.com/${value.replace(/^@/, "")}/`,
            ),
        ),
      );

      if (directUrls.length === 0) {
        toast.error("Nenhum perfil de origem encontrado");
        return;
      }

      const days = coerceRecentDays(importRecentDays);
      const maxPosts = coerceRecentDays(importMaxPosts, 20);
      const response = await fetchBackend("/instagram/resolve-urls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          directUrls,
          resultsType: "posts",
          resultsLimit: directUrls.length * maxPosts,
          maxPostsPerUrl: maxPosts,
          onlyPostsNewerThan: buildOnlyPostsNewerThan(days),
          mediaType: "video",
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || data.error || `HTTP ${response.status}`);
      }

      const data = (await response.json()) as ResolveUrlsResponse;
      const resolvedUrls = (data.urls || []).filter((url) => validateUrl(url));
      if (resolvedUrls.length === 0) {
        toast.info("Nenhum video recente foi encontrado para esse periodo.");
        return;
      }

      const existingUrls = new Set(items.map((item) => item.url));
      const newItems = resolvedUrls
        .filter((url) => !existingUrls.has(url))
        .map<QueueItem>((url) => ({
          id: crypto.randomUUID(),
          url,
          platform,
          status: "pending",
          detected_language: null,
          transcricao_original: null,
          roteiro_adaptado: null,
          error_message: null,
        }));

      if (newItems.length === 0) {
        toast.info("Todos os videos recentes ja estao na fila.");
        return;
      }

      startTransition(() => {
        setItems((currentItems) => [...currentItems, ...newItems]);
      });
      toast.success(`${newItems.length} video(s) recente(s) adicionados a fila`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao buscar videos recentes";
      toast.error(message);
    } finally {
      setIsImportingRecent(false);
    }
  };
  useEffect(() => {
    if (!batchId) return;

    fetchBatchStatus(batchId);
    if (batchStatus && batchStatus !== "processing") return;

    const intervalId = window.setInterval(() => {
      fetchBatchStatus(batchId);
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [batchId, batchStatus]);

  const isRunning = batchStatus === "processing";
  const isQueueLocked = batchId !== null;
  const successItems = items.filter((item) => item.status === "success");
  const errorItems = items.filter((item) => item.status === "error");
  const processingCount = items.filter((item) => item.status === "processing").length;
  const pendingCount = items.filter((item) => item.status === "pending").length;
  const totalCount = items.length;
  const derivedCompleted = completedCount || countCompletedItems(items);
  const progressPercent = totalCount > 0 ? Math.round((derivedCompleted / totalCount) * 100) : 0;
  const consolidatedText = buildConsolidatedText(items);

  const handleReset = () => {
    setUrlText("");
    setItems([]);
    setBatchId(null);
    setBatchStatus(null);
    setCompletedCount(0);
    completionToastRef.current = null;
  };

  const handleAddLinks = () => {
    if (isQueueLocked) {
      toast.info("Clique em 'Novo lote' para montar outra fila.");
      return;
    }

    const parsedLinks = parseUrlLines(urlText);
    if (parsedLinks.length === 0) {
      toast.error("Insira pelo menos uma URL");
      return;
    }

    const invalidLinks = parsedLinks.filter((url) => !validateUrl(url));
    if (invalidLinks.length > 0) {
      const platformLabel = platform === "instagram" ? "Instagram" : platform === "tiktok" ? "TikTok" : "YouTube";
      toast.error(`${invalidLinks.length} URL(s) invalidas para ${platformLabel}`);
      return;
    }

    const existingUrls = new Set(items.map((item) => item.url));
    const newItems = parsedLinks
      .filter((url) => !existingUrls.has(url))
      .map<QueueItem>((url) => ({
        id: crypto.randomUUID(),
        url,
        platform,
        status: "pending",
        detected_language: null,
        transcricao_original: null,
        roteiro_adaptado: null,
        error_message: null,
      }));

    if (newItems.length === 0) {
      toast.info("Todas as URLs ja foram adicionadas");
      return;
    }

    startTransition(() => {
      setItems((currentItems) => [...currentItems, ...newItems]);
      setUrlText("");
    });
    toast.success(`${newItems.length} link(s) adicionado(s) a fila`);
  };

  const handleRemoveItem = (itemId: string) => {
    setItems((currentItems) => currentItems.filter((item) => item.id !== itemId));
  };

  const handleStartBatch = async () => {
    if (!user?.id) {
      toast.error("Nao foi possivel identificar o usuario atual");
      return;
    }

    const pendingItems = items.filter((item) => item.status === "pending");
    if (pendingItems.length === 0) {
      toast.error("Adicione pelo menos uma URL antes de iniciar");
      return;
    }

    setIsStarting(true);
    completionToastRef.current = null;

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }

      const response = await fetchBackend("/transcribe/batch", {
        method: "POST",
        headers,
        body: JSON.stringify({
          urls: pendingItems.map((item) => item.url),
          platform,
          user_id: user.id,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const detail = typeof data.detail === "string" ? data.detail : data.detail?.message;
        throw new Error(detail || data.error || `HTTP ${response.status}`);
      }

      const data = (await response.json()) as { batch_id: string; status: Exclude<BatchStatus, null>; total: number };
      setBatchId(data.batch_id);
      setBatchStatus(data.status);
      setCompletedCount(0);
      toast.success(`Lote iniciado com ${data.total} URL(s). O processamento segue em fila controlada.`);
      fetchTranscriptionHistory();
      await fetchBatchStatus(data.batch_id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao iniciar a transcricao em lote";
      toast.error(message);
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div className="flex flex-col flex-1">
      <div className="page-header">
        <div className="page-header-icon">{headerIcon}</div>
        <div>
          <h1 className="page-header-title" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700 }}>
            {headerTitle}
          </h1>
          <p className="page-header-sub">{headerSub}</p>
        </div>
      </div>

      <div
        className="page-content overflow-y-auto flex-1"
        style={centerContent ? { display: "flex", justifyContent: "center" } : undefined}
      >
        <div className={`w-full ${contentMaxWidthClassName} mx-auto space-y-6`}>
          {platform === "instagram" ? (
            <section className="form-card">
              <div className="batch-section-header">
                <div className="batch-section-copy">
                  <div className="form-card-title">
                    <Search className="w-3.5 h-3.5" />
                    Importar videos recentes
                  </div>
                  <p style={{ color: "var(--text-3)", fontSize: 13, lineHeight: 1.6, marginTop: -2, marginBottom: 0 }}>
                    Use os perfis de origem cadastrados em Perfis para montar a fila por periodo.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 mt-4 md:grid-cols-[1.4fr_0.9fr_0.8fr]">
                <label className="grid gap-2 text-[12px]" style={{ color: "var(--text-3)" }}>
                  Perfil
                  <select
                    value={selectedImportProfileId}
                    onChange={(event) => setSelectedImportProfileId(event.target.value)}
                    className="field-input"
                    style={{ minHeight: 42, padding: "0 12px", color: "var(--text-1)", outline: "none" }}
                    disabled={isQueueLocked || isImportingRecent}
                  >
                    {importProfiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.client_name} - @{profile.own_instagram}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2 text-[12px]" style={{ color: "var(--text-3)" }}>
                  Periodo
                  <select
                    value={importRecentDays}
                    onChange={(event) => setImportRecentDays(event.target.value)}
                    className="field-input"
                    style={{ minHeight: 42, padding: "0 12px", color: "var(--text-1)", outline: "none" }}
                    disabled={isQueueLocked || isImportingRecent}
                  >
                    {RECENT_DAY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2 text-[12px]" style={{ color: "var(--text-3)" }}>
                  Posts/origem
                  <input
                    value={importMaxPosts}
                    onChange={(event) => setImportMaxPosts(event.target.value)}
                    type="number"
                    min={1}
                    max={80}
                    className="field-input"
                    style={{ minHeight: 42, padding: "0 12px", color: "var(--text-1)", outline: "none" }}
                    disabled={isQueueLocked || isImportingRecent}
                  />
                </label>
              </div>

              <div className="batch-actions-row">
                <div className="batch-actions-main">
                  <button
                    type="button"
                    className="btn-primary batch-button"
                    onClick={handleImportRecentVideos}
                    disabled={isQueueLocked || isImportingRecent || importProfiles.length === 0}
                  >
                    {isImportingRecent ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                    Buscar e adicionar
                  </button>

                  <div className="batch-inline-note" style={{ color: "var(--text-3)" }}>
                    <Languages className="w-3.5 h-3.5" style={{ color: accentColor }} />
                    Apenas videos e reels entram na fila.
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          <section className="batch-history-trigger-card">
            <div className="batch-history-trigger-copy">
              <div className="batch-history-heading-icon">
                <History className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="batch-history-trigger-title">Historico salvo</div>
                <p className="batch-history-subtitle">
                  {historyBatches.length > 0 ? `${historyBatches.length} lote(s) recentes` : "Abra para ver lotes anteriores"}
                </p>
              </div>
            </div>

            <button
              type="button"
              className="btn-ghost batch-button batch-button-ghost batch-history-trigger-button"
              onClick={() => {
                setHistoryOpen(true);
                fetchTranscriptionHistory();
              }}
            >
              <History className="w-3.5 h-3.5" />
              Ver historico
            </button>
          </section>

          <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
            <DialogContent className="batch-history-dialog-content">
              <DialogHeader className="batch-history-dialog-header">
                <DialogTitle className="batch-history-dialog-title">Historico salvo</DialogTitle>
                <DialogDescription>
                  {historyBatches.length > 0 ? `${historyBatches.length} lote(s) recentes desta plataforma` : "Os lotes finalizados aparecem aqui."}
                </DialogDescription>
              </DialogHeader>

              <div className="batch-history-dialog-toolbar">
                <button
                  type="button"
                  className="btn-ghost batch-button batch-button-ghost batch-history-refresh"
                  onClick={() => fetchTranscriptionHistory()}
                  disabled={historyLoading}
                >
                  {historyLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                  Atualizar
                </button>
              </div>

              {historyLoading ? (
                <div className="batch-history-loading">
                  <Loader2 className="w-4 h-4 animate-spin" /> Carregando historico...
                </div>
              ) : historyBatches.length === 0 ? (
                <div className="batch-history-empty">
                  Nenhum lote salvo para esta plataforma.
                </div>
              ) : (
                <div className="batch-history-list batch-history-list-dialog">
                  {historyBatches.map((batch) => {
                    const statusMeta = getBatchStatusMeta(batch.status);
                    const StatusIcon = statusMeta.icon;
                    const progressPercent = getBatchProgressPercent(batch);

                    return (
                      <div key={batch.id} className={`batch-history-row ${statusMeta.className}`}>
                        <div className="batch-history-row-main">
                          <div className="batch-history-row-top">
                            <span className="batch-history-date">
                              <CalendarClock className="w-3.5 h-3.5" />
                              {formatBatchDate(batch.created_at)}
                            </span>
                            <span className={`batch-history-status ${statusMeta.className}`}>
                              <StatusIcon className={`w-3.5 h-3.5 ${batch.status === "processing" ? "animate-spin" : ""}`} />
                              {statusMeta.label}
                            </span>
                          </div>

                          <div className="batch-history-progress-row">
                            <div className="batch-history-progress" aria-hidden="true">
                              <span style={{ width: `${progressPercent}%` }} />
                            </div>
                            <span className="batch-history-count">
                              {batch.completed_items}/{batch.total_items} transcritos
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          className="btn-ghost batch-button batch-button-compact batch-history-open"
                          onClick={() => handleOpenHistoryBatch(batch)}
                          disabled={openingHistoryId === batch.id || isRunning}
                        >
                          {openingHistoryId === batch.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
                          Abrir
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </DialogContent>
          </Dialog>
          <section className="form-card">
            <div className="batch-section-header">
              <div className="batch-section-copy">
                <div className="form-card-title">
                  <Link2 className="w-3.5 h-3.5" />
                  1. Input de links
                </div>
                <p style={{ color: "var(--text-3)", fontSize: 13, lineHeight: 1.6, marginTop: -2, marginBottom: 0 }}>
                  Cole uma URL por linha. A fila aceita 30-60+ links por lote sem interromper os itens que falharem.
                </p>
              </div>
            </div>

            <Textarea
              value={urlText}
              onChange={(event) => setUrlText(event.target.value)}
              placeholder={
                platform === "instagram"
                  ? "https://www.instagram.com/reel/...\nhttps://www.instagram.com/p/..."
                  : platform === "tiktok"
                  ? "https://www.tiktok.com/@user/video/...\nhttps://vm.tiktok.com/..."
                  : "https://www.youtube.com/watch?v=...\nhttps://youtu.be/..."
              }
              rows={8}
              className="text-[13px] resize-none mt-4"
              disabled={isQueueLocked || isStarting}
            />

            <div className="batch-actions-row">
              <div className="batch-actions-main">
                <button
                  type="button"
                  className="btn-primary batch-button"
                  onClick={handleAddLinks}
                  disabled={!urlText.trim() || isQueueLocked || isStarting}
                >
                  <Link2 className="w-3.5 h-3.5" />
                  Adicionar links
                </button>

                <div
                  className="batch-inline-note"
                  style={{ color: "var(--text-3)" }}
                >
                  <Languages className="w-3.5 h-3.5" style={{ color: accentColor }} />
                  Validacao especifica para {platform === "instagram" ? "Instagram" : platform === "tiktok" ? "TikTok" : "YouTube"}
                </div>
              </div>

              <div className="batch-actions-side">
                <button
                  type="button"
                  className="btn-ghost batch-button batch-button-ghost"
                  onClick={handleReset}
                  disabled={isRunning || isStarting || (items.length === 0 && !urlText.trim())}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Novo lote
                </button>
              </div>
            </div>
          </section>

          <section className="form-card !p-0">
            <div
              className="px-5 py-4 flex flex-wrap items-center justify-between gap-3"
              style={{ borderBottom: "1px solid var(--border)" }}
            >
              <div>
                <div className="form-card-title !mb-1">
                  <Languages className="w-3.5 h-3.5" />
                  2. Fila e progresso
                </div>
                <p style={{ color: "var(--text-3)", fontSize: 12, margin: 0 }}>
                  {totalCount > 0
                    ? `${derivedCompleted}/${totalCount} transcritos`
                    : "Adicione links para montar a fila"}
                </p>
              </div>

              <button
                type="button"
                className="btn-cta batch-button batch-progress-button disabled:opacity-40"
                style={{
                  background: `linear-gradient(135deg, ${accentColor}, rgba(255,255,255,0.08))`,
                  boxShadow: `0 10px 28px ${accentColor}33`,
                }}
                onClick={handleStartBatch}
                disabled={totalCount === 0 || isQueueLocked || isStarting}
              >
                <span className="flex items-center justify-center gap-2">
                  {isStarting || isRunning ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  {isRunning ? "Transcrevendo..." : isStarting ? "Iniciando..." : "Iniciar Transcricao em Lote"}
                </span>
              </button>
            </div>

            <div className="px-5 pt-4 pb-2">
              <div
                style={{
                  width: "100%",
                  height: 10,
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.06)",
                  overflow: "hidden",
                  border: "1px solid rgba(255,255,255,0.05)",
                }}
              >
                <div
                  style={{
                    width: `${progressPercent}%`,
                    height: "100%",
                    borderRadius: 999,
                    background: `linear-gradient(135deg, ${accentColor}, rgba(255,255,255,0.32))`,
                    transition: "width 0.28s ease",
                  }}
                />
              </div>

              <div className="flex flex-wrap gap-2 mt-3 pb-3">
                <span className="badge" style={{ background: STATUS_META.pending.background, border: STATUS_META.pending.border, color: STATUS_META.pending.color }}>
                  {pendingCount} pendentes
                </span>
                <span className="badge" style={{ background: STATUS_META.processing.background, border: STATUS_META.processing.border, color: STATUS_META.processing.color }}>
                  {processingCount} transcrevendo
                </span>
                <span className="badge" style={{ background: STATUS_META.success.background, border: STATUS_META.success.border, color: STATUS_META.success.color }}>
                  {successItems.length} concluidos
                </span>
                <span className="badge" style={{ background: STATUS_META.error.background, border: STATUS_META.error.border, color: STATUS_META.error.color }}>
                  {errorItems.length} erros
                </span>
              </div>
            </div>

            {totalCount === 0 ? (
              <div className="px-5 py-10 flex flex-col items-center justify-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: "var(--surface)" }}
                >
                  <Link2 className="w-4 h-4" style={{ color: "var(--text-3)" }} />
                </div>
                <p className="text-[13px]" style={{ color: "var(--text-3)" }}>
                  Nenhum link na fila ainda.
                </p>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {items.map((item) => {
                  const statusMeta = STATUS_META[item.status];
                  return (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="px-5 py-4"
                      style={{ borderTop: "1px solid var(--border)" }}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className="badge"
                          style={{
                            background: statusMeta.background,
                            border: statusMeta.border,
                            color: statusMeta.color,
                            marginTop: 1,
                          }}
                        >
                          {item.status === "processing" ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                          {item.status === "success" ? <CheckCircle2 className="w-3 h-3" /> : null}
                          {item.status === "error" ? <AlertCircle className="w-3 h-3" /> : null}
                          {statusMeta.label}
                        </span>

                        <div className="min-w-0 flex-1">
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-[13px] transition-opacity hover:opacity-80"
                            style={{ color: "var(--text-1)" }}
                            title={item.url}
                          >
                            <span className="truncate max-w-[780px]">{item.url}</span>
                            <ExternalLink className="w-3.5 h-3.5 shrink-0" style={{ color: accentColor }} />
                          </a>

                          {item.detected_language ? (
                            <div style={{ color: "var(--text-3)", fontSize: 12, marginTop: 6 }}>
                              Idioma detectado: {formatLanguageLabel(item.detected_language)}
                            </div>
                          ) : null}

                          {item.error_message ? (
                            <div style={{ color: "#fda4af", fontSize: 12, lineHeight: 1.5, marginTop: 6 }}>
                              {item.error_message}
                            </div>
                          ) : null}
                        </div>

                        {!batchId && item.status === "pending" ? (
                          <button
                            type="button"
                            className="icon-btn shrink-0"
                            style={{ width: 28, height: 28 }}
                            onClick={() => handleRemoveItem(item.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </section>

          <section className="form-card">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="form-card-title">
                  <Copy className="w-3.5 h-3.5" />
                  3. Resultado consolidado
                </div>
                <p style={{ color: "var(--text-3)", fontSize: 13, lineHeight: 1.6, marginTop: -2, marginBottom: 0 }}>
                  O documento abaixo junta a transcricao original no idioma de origem com o roteiro adaptado em PT-BR para teleprompter.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-ghost batch-button batch-button-ghost"
                  disabled={successItems.length === 0}
                  onClick={() => copyToClipboard(consolidatedText, "Documento consolidado copiado.")}
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copiar tudo
                </button>
                <button
                  type="button"
                  className="btn-ghost batch-button batch-button-ghost"
                  disabled={successItems.length === 0}
                  onClick={() =>
                    downloadTextFile(
                      `transcritor-${platform}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.txt`,
                      consolidatedText,
                    )
                  }
                >
                  <Download className="w-3.5 h-3.5" />
                  Exportar .txt
                </button>
                <button
                  type="button"
                  className="btn-ghost batch-button batch-button-ghost"
                  disabled={successItems.length === 0}
                  onClick={() =>
                    downloadDocxFile(
                      `transcritor-${platform}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.docx`,
                      consolidatedText,
                    )
                  }
                >
                  <Download className="w-3.5 h-3.5" />
                  Exportar .docx
                </button>
                <button
                  type="button"
                  className="btn-ghost batch-button batch-button-ghost"
                  disabled={successItems.length === 0}
                  onClick={() =>
                    downloadPdfFile(
                      `transcritor-${platform}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.pdf`,
                      consolidatedText,
                    )
                  }
                >
                  <Download className="w-3.5 h-3.5" />
                  Exportar .pdf
                </button>
              </div>
            </div>

            {successItems.length === 0 && errorItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: "var(--surface)" }}
                >
                  <Languages className="w-4 h-4" style={{ color: "var(--text-3)" }} />
                </div>
                <p className="text-[13px]" style={{ color: "var(--text-3)" }}>
                  Os blocos consolidados vao aparecer aqui conforme cada URL for concluida.
                </p>
              </div>
            ) : (
              <div className="space-y-4 mt-5">
                {successItems.map((item) => (
                  <div
                    key={item.id}
                    className="section-card"
                    style={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <div className="section-card-bar" style={{ background: accentColor }} />
                    <div className="section-card-body">
                      <div className="section-card-header">
                        <div className="section-card-label" style={{ color: accentColor }}>
                          <Languages className="w-3.5 h-3.5" />
                          Resultado pronto
                        </div>

                        <button
                          type="button"
                          className="btn-ghost batch-button batch-button-compact"
                          onClick={() => copyToClipboard(buildResultText(item), "Bloco copiado.")}
                        >
                          <Copy className="w-3.5 h-3.5" />
                          Copiar
                        </button>
                      </div>

                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-[13px] font-medium transition-opacity hover:opacity-80"
                        style={{ color: "var(--text-1)" }}
                      >
                        <Link2 className="w-3.5 h-3.5" style={{ color: accentColor }} />
                        {item.url}
                        <ExternalLink className="w-3.5 h-3.5" style={{ color: accentColor }} />
                      </a>

                      <div style={{ color: "var(--text-3)", fontSize: 12, marginTop: 8 }}>
                        Idioma detectado: {formatLanguageLabel(item.detected_language)}
                      </div>

                      <div className="grid gap-4 mt-4">
                        <div
                          className="rounded-xl p-4"
                          style={{
                            background: "rgba(255,255,255,0.03)",
                            border: "1px solid rgba(255,255,255,0.06)",
                          }}
                        >
                          <div style={{ color: "var(--text-1)", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
                            Transcricao original
                          </div>
                          <div style={{ color: "var(--text-2)", fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                            {item.transcricao_original}
                          </div>
                        </div>

                        <div
                          className="rounded-xl p-4"
                          style={{
                            background: `${accentColor}0d`,
                            border: `1px solid ${accentColor}33`,
                          }}
                        >
                          <div style={{ color: accentColor, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
                            Roteiro adaptado
                          </div>
                          <div style={{ color: "var(--text-1)", fontSize: 13, lineHeight: 1.75, whiteSpace: "pre-wrap" }}>
                            {item.roteiro_adaptado}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {errorItems.length > 0 ? (
                  <div
                    className="rounded-2xl p-4"
                    style={{
                      background: "rgba(239,68,68,0.06)",
                      border: "1px solid rgba(239,68,68,0.16)",
                    }}
                  >
                    <div className="form-card-title !mb-3">
                      <AlertCircle className="w-3.5 h-3.5" />
                      URLs com erro
                    </div>

                    <div className="space-y-3">
                      {errorItems.map((item) => (
                        <div key={item.id}>
                          <div style={{ color: "var(--text-1)", fontSize: 13, lineHeight: 1.5 }}>{item.url}</div>
                          <div style={{ color: "#fca5a5", fontSize: 12, lineHeight: 1.6, marginTop: 4 }}>
                            {item.error_message || "Falha ao processar este link."}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
