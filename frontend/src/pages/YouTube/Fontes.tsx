import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { fetchBackend, getPublicBackendBaseUrl } from "@/lib/backendApi";
import { Loader2, Youtube, Pencil, Play, Plus, Search, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { YouTubeChannel } from "./types";
import { normalizeYouTubeUrl, formatCompactNumber, formatDate, isYouTubeSchemaMissingError } from "./types";

const YT_GRADIENT = "linear-gradient(135deg, #ff0000, #c4302b)";
const YT_COLOR = "#ff0000";

export default function Fontes() {
  const { user, role } = useAuth();
  const [channels, setChannels] = useState<YouTubeChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [scrapingId, setScrapingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<YouTubeChannel | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [schemaMissing, setSchemaMissing] = useState(false);

  // New channel form
  const [formName, setFormName] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formMax, setFormMax] = useState(10);
  const [formPrompt, setFormPrompt] = useState("");

  // Edit prompt
  const [editingChannel, setEditingChannel] = useState<YouTubeChannel | null>(null);
  const [editPrompt, setEditPrompt] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [formLoading, setFormLoading] = useState(false);

  const fetchChannels = useCallback(async () => {
    setLoading(true);
    try {
      setSchemaMissing(false);
      let query = supabase.from("youtube_channels").select("*").order("created_at", { ascending: false });
      if (role !== "admin" && user?.id) query = query.eq("user_id", user.id);
      const { data, error } = await query;
      if (error) throw error;
      setChannels((data || []) as YouTubeChannel[]);
    } catch (error) {
      if (isYouTubeSchemaMissingError(error)) {
        setSchemaMissing(true);
      } else {
        toast.error(error instanceof Error ? error.message : "Erro ao buscar canais YouTube");
      }
    } finally {
      setLoading(false);
    }
  }, [user, role]);

  useEffect(() => { fetchChannels(); }, [fetchChannels]);

  const handleCreate = async () => {
    const trimmedName = formName.trim();
    const normalizedUrl = normalizeYouTubeUrl(formUrl);
    if (!trimmedName || !normalizedUrl) {
      toast.error("Preencha o nome e a URL");
      return;
    }
    setFormLoading(true);
    try {
      let handle: string | null = null;
      const atMatch = normalizedUrl.match(/\/@([^/?#]+)/);
      if (atMatch) handle = atMatch[1];

      const { error } = await supabase.from("youtube_channels").insert({
        user_id: user?.id ?? null,
        name: trimmedName,
        handle,
        url: normalizedUrl,
        max_videos: Math.min(50, Math.max(1, formMax)),
        custom_prompt: formPrompt.trim() || null,
      });
      if (error) throw error;
      toast.success("Canal criado");
      setFormName(""); setFormUrl(""); setFormMax(10); setFormPrompt("");
      setDialogOpen(false);
      fetchChannels();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao criar canal");
    } finally {
      setFormLoading(false);
    }
  };

  const handleScrape = async (e: MouseEvent, channel: YouTubeChannel) => {
    e.stopPropagation();
    setScrapingId(channel.id);
    try {
      const backendBaseUrl = getPublicBackendBaseUrl();
      const resp = await fetchBackend("/youtube/collect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel_id: channel.id,
          start_urls: [channel.url],
          max_videos: channel.max_videos,
          client_name: channel.name,
          source: "channel",
          backendUrl: backendBaseUrl || undefined,
        }),
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData?.error || `HTTP ${resp.status}`);
      }
      toast.success(`Scraping de ${channel.name} iniciado — os videos vao aparecer em Conteudos`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao iniciar scraping");
    } finally {
      setScrapingId(null);
    }
  };

  const handleSavePrompt = async () => {
    if (!editingChannel) return;
    setEditSaving(true);
    try {
      const { error } = await supabase.from("youtube_channels").update({ custom_prompt: editPrompt.trim() || null }).eq("id", editingChannel.id);
      if (error) throw error;
      toast.success("Prompt salvo");
      setEditingChannel(null);
      fetchChannels();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar prompt");
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("youtube_channels").delete().eq("id", deleteTarget.id);
      if (error) throw error;
      toast.success("Canal excluido");
      setDeleteTarget(null);
      fetchChannels();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao excluir");
    } finally {
      setDeleting(false);
    }
  };

  const filtered = channels.filter((c) => {
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || (c.handle || "").toLowerCase().includes(q) || c.url.toLowerCase().includes(q);
  });

  const inputStyle = { background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-1)", borderRadius: "var(--radius)" };

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="page-header-icon" style={{ background: YT_GRADIENT }}>
          <Youtube className="w-[18px] h-[18px]" style={{ color: "#fff" }} />
        </div>
        <div>
          <h1 className="page-header-title">Fontes YouTube</h1>
          <p className="page-header-sub">Gerencie canais do YouTube e scrapeie videos para analise</p>
        </div>
      </div>

      {schemaMissing && (
        <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.18)", color: "var(--text-2)", borderRadius: 18, padding: 18, marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-1)", marginBottom: 6 }}>Modulo YouTube ainda nao foi criado no banco</div>
          <p style={{ fontSize: 13, lineHeight: 1.6, margin: 0 }}>Rode a migration <code>20260417_youtube.sql</code> no Supabase para habilitar esta pagina.</p>
        </div>
      )}

      <div className="insp-toolbar">
        <div className="search-wrap">
          <Search className="search-icon" size={15} />
          <input className="search-input" placeholder="Buscar canal..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button className="btn-primary" onClick={() => setDialogOpen(true)} disabled={schemaMissing}>
          <Plus size={15} /> Novo canal
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--text-3)" }} /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <p className="text-[13px]" style={{ color: "var(--text-3)" }}>Nenhum canal YouTube encontrado.</p>
        </div>
      ) : (
        <div className="profiles-grid">
          {filtered.map((channel, i) => (
            <motion.div
              key={channel.id}
              className="profile-card"
              style={{ cursor: "default" }}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.2 }}
            >
              <div className="profile-header">
                <div className="profile-info">
                  {channel.avatar ? (
                    <img src={channel.avatar} alt="" className="profile-avatar" style={{ objectFit: "cover", background: "none" }} />
                  ) : (
                    <div className="profile-avatar" style={{ background: "var(--surface)" }}>
                      {channel.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="profile-names">
                    <div className="profile-name">{channel.name}</div>
                    <div className="profile-handle">{channel.handle ? `@${channel.handle}` : channel.url}</div>
                  </div>
                </div>
                <div className="profile-actions">
                  <button onClick={(e) => { e.stopPropagation(); setEditingChannel(channel); setEditPrompt(channel.custom_prompt || ""); }} className="icon-btn" title="Editar prompt"><Pencil size={13} /></button>
                  <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(channel); }} className="icon-btn" title="Excluir"><Trash2 size={13} /></button>
                </div>
              </div>
              <div className="profile-stats">
                {channel.subscribers != null && (
                  <div>
                    <div className="stat-value">{formatCompactNumber(channel.subscribers)}</div>
                    <div className="stat-label">Inscritos</div>
                  </div>
                )}
                {channel.total_views != null && (
                  <div>
                    <div className="stat-value">{formatCompactNumber(channel.total_views)}</div>
                    <div className="stat-label">Views</div>
                  </div>
                )}
                <div>
                  <div className="stat-value">{channel.max_videos}</div>
                  <div className="stat-label">Videos/coleta</div>
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="profile-tag" style={{ background: "rgba(255,0,0,0.12)", color: YT_COLOR, border: "1px solid rgba(255,0,0,0.2)" }}>YouTube</span>
                  {channel.last_scraped_at && (
                    <span style={{ fontSize: 11, color: "var(--text-3)" }}>Coleta: {formatDate(channel.last_scraped_at)}</span>
                  )}
                </div>
                <button
                  className="btn-primary"
                  style={{ padding: "6px 14px", fontSize: 12 }}
                  onClick={(e) => handleScrape(e, channel)}
                  disabled={scrapingId === channel.id}
                >
                  {scrapingId === channel.id ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Scraping
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* New channel dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text-1)" }}>
          <DialogHeader><DialogTitle style={{ color: "var(--text-1)" }}>Novo canal YouTube</DialogTitle></DialogHeader>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div><Label style={{ color: "var(--text-2)" }}>Nome</Label><Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Ex: MrBeast" style={inputStyle} /></div>
            <div><Label style={{ color: "var(--text-2)" }}>URL do canal ou @handle</Label><Input value={formUrl} onChange={(e) => setFormUrl(e.target.value)} placeholder="Ex: @mrbeast ou https://www.youtube.com/@mrbeast" style={inputStyle} /></div>
            <div><Label style={{ color: "var(--text-2)" }}>Max videos por coleta</Label><Input type="number" value={formMax} onChange={(e) => setFormMax(Number(e.target.value))} min={1} max={50} style={inputStyle} /></div>
            <div>
              <Label style={{ color: "var(--text-2)" }}>Prompt personalizado (opcional)</Label>
              <p style={{ fontSize: 11, color: "var(--text-3)", margin: "4px 0 6px" }}>Define a identidade, tom de voz e nicho para a IA readaptar o conteudo. Ex: "Canal de fitness feminino, tom motivacional, publico: mulheres 25-40"</p>
              <Textarea value={formPrompt} onChange={(e) => setFormPrompt(e.target.value)} placeholder="Descreva quem e o cliente, tom de voz, nicho, publico-alvo..." rows={4} style={{ ...inputStyle, resize: "vertical", fontSize: 13 }} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleCreate} disabled={formLoading}>{formLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit prompt dialog */}
      <Dialog open={!!editingChannel} onOpenChange={(open) => { if (!open) setEditingChannel(null); }}>
        <DialogContent style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text-1)", maxWidth: 560 }}>
          <DialogHeader><DialogTitle style={{ color: "var(--text-1)" }}>Prompt de {editingChannel?.name}</DialogTitle></DialogHeader>
          <div>
            <p style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 10, lineHeight: 1.5 }}>
              Este prompt define como a IA vai analisar e readaptar o conteudo coletado deste canal. Descreva a identidade do cliente, tom de voz, nicho e publico-alvo.
            </p>
            <Textarea
              value={editPrompt}
              onChange={(e) => setEditPrompt(e.target.value)}
              placeholder="Ex: Canal do Flamengo. Tom: institucional e apaixonado. Nicho: futebol, esporte. Publico: torcedores. Pilares: bastidores, jogos, contratacoes, historia do clube."
              rows={8}
              style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-1)", borderRadius: "var(--radius)", resize: "vertical", fontSize: 13, width: "100%" }}
            />
            {editingChannel?.custom_prompt && (
              <button
                onClick={() => setEditPrompt("")}
                style={{ marginTop: 8, fontSize: 12, color: "var(--text-3)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
              >
                Limpar prompt
              </button>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingChannel(null)} style={{ border: "1px solid var(--border)", color: "var(--text-2)" }}>Cancelar</Button>
            <Button onClick={handleSavePrompt} disabled={editSaving}>{editSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
          <AlertDialogHeader>
            <AlertDialogTitle style={{ color: "var(--text-1)" }}>Excluir canal?</AlertDialogTitle>
            <AlertDialogDescription style={{ color: "var(--text-2)" }}>Todos os videos e readaptados deste canal serao excluidos.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel style={{ border: "1px solid var(--border)", color: "var(--text-2)", background: "transparent" }}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} style={{ background: "#ef4444", color: "#fff", border: "none" }}>{deleting ? "Excluindo..." : "Excluir"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
