import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { fetchBackend, getPublicBackendBaseUrl } from "@/lib/backendApi";
import { Loader2, Music2, Pencil, Play, Plus, Search, Trash2 } from "lucide-react";
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
import type { TikTokProfile } from "./types";
import { normalizeTikTokUrl, formatCompactNumber, formatDate, isTikTokSchemaMissingError } from "./types";

export default function Fontes() {
  const { user, role } = useAuth();
  const [profiles, setProfiles] = useState<TikTokProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [scrapingId, setScrapingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TikTokProfile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [schemaMissing, setSchemaMissing] = useState(false);

  // New profile form
  const [formName, setFormName] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formMax, setFormMax] = useState(12);
  const [formPrompt, setFormPrompt] = useState("");

  // Edit prompt
  const [editingProfile, setEditingProfile] = useState<TikTokProfile | null>(null);
  const [editPrompt, setEditPrompt] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [formLoading, setFormLoading] = useState(false);

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    try {
      setSchemaMissing(false);
      let query = supabase.from("tiktok_profiles").select("*").order("created_at", { ascending: false });
      if (role !== "admin" && user?.id) query = query.eq("user_id", user.id);
      const { data, error } = await query;
      if (error) throw error;
      setProfiles((data || []) as TikTokProfile[]);
    } catch (error) {
      if (isTikTokSchemaMissingError(error)) {
        setSchemaMissing(true);
      } else {
        toast.error(error instanceof Error ? error.message : "Erro ao buscar perfis TikTok");
      }
    } finally {
      setLoading(false);
    }
  }, [user, role]);

  useEffect(() => { fetchProfiles(); }, [fetchProfiles]);

  const handleCreate = async () => {
    const trimmedName = formName.trim();
    const normalizedUrl = normalizeTikTokUrl(formUrl);
    if (!trimmedName || !normalizedUrl) {
      toast.error("Preencha o nome e a URL");
      return;
    }
    setFormLoading(true);
    try {
      const { error } = await supabase.from("tiktok_profiles").insert({
        user_id: user?.id ?? null,
        name: trimmedName,
        handle: normalizedUrl.includes("@") ? normalizedUrl.split("@").pop()?.split("?")[0] || null : null,
        url: normalizedUrl,
        max_videos: Math.min(50, Math.max(1, formMax)),
        custom_prompt: formPrompt.trim() || null,
      });
      if (error) throw error;
      toast.success("Perfil criado");
      setFormName(""); setFormUrl(""); setFormMax(12); setFormPrompt("");
      setDialogOpen(false);
      fetchProfiles();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao criar perfil");
    } finally {
      setFormLoading(false);
    }
  };

  const handleScrape = async (e: MouseEvent, profile: TikTokProfile) => {
    e.stopPropagation();
    setScrapingId(profile.id);
    try {
      const handle = profile.handle || profile.url.split("@").pop()?.split("?")[0] || profile.name;
      const profileHandle = handle.startsWith("@") ? handle : `@${handle}`;
      const backendBaseUrl = getPublicBackendBaseUrl();
      const resp = await fetchBackend("/tiktok/collect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile_id: profile.id,
          profiles: [profileHandle],
          max_videos: profile.max_videos,
          client_name: profile.name,
          source: "profile",
          backendUrl: backendBaseUrl || undefined,
        }),
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData?.error || `HTTP ${resp.status}`);
      }
      toast.success(`Scraping de ${profileHandle} iniciado — os posts vao aparecer em Conteudos`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao iniciar scraping");
    } finally {
      setScrapingId(null);
    }
  };

  const handleSavePrompt = async () => {
    if (!editingProfile) return;
    setEditSaving(true);
    try {
      const { error } = await supabase.from("tiktok_profiles").update({ custom_prompt: editPrompt.trim() || null }).eq("id", editingProfile.id);
      if (error) throw error;
      toast.success("Prompt salvo");
      setEditingProfile(null);
      fetchProfiles();
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
      const { error } = await supabase.from("tiktok_profiles").delete().eq("id", deleteTarget.id);
      if (error) throw error;
      toast.success("Perfil excluido");
      setDeleteTarget(null);
      fetchProfiles();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao excluir");
    } finally {
      setDeleting(false);
    }
  };

  const filtered = profiles.filter((p) => {
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || (p.handle || "").toLowerCase().includes(q) || p.url.toLowerCase().includes(q);
  });

  const inputStyle = { background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-1)", borderRadius: "var(--radius)" };

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="page-header-icon" style={{ background: "linear-gradient(135deg, #00f2ea, #ff0050)" }}>
          <Music2 className="w-[18px] h-[18px]" style={{ color: "#fff" }} />
        </div>
        <div>
          <h1 className="page-header-title">Fontes TikTok</h1>
          <p className="page-header-sub">Gerencie perfis do TikTok e scrapeie videos para analise</p>
        </div>
      </div>

      {schemaMissing && (
        <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.18)", color: "var(--text-2)", borderRadius: 18, padding: 18, marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-1)", marginBottom: 6 }}>Modulo TikTok ainda nao foi criado no banco</div>
          <p style={{ fontSize: 13, lineHeight: 1.6, margin: 0 }}>Rode a migration <code>20260416_tiktok.sql</code> no Supabase para habilitar esta pagina.</p>
        </div>
      )}

      <div className="insp-toolbar">
        <div className="search-wrap">
          <Search className="search-icon" size={15} />
          <input className="search-input" placeholder="Buscar perfil..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button className="btn-primary" onClick={() => setDialogOpen(true)} disabled={schemaMissing}>
          <Plus size={15} /> Novo perfil
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--text-3)" }} /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <p className="text-[13px]" style={{ color: "var(--text-3)" }}>Nenhum perfil TikTok encontrado.</p>
        </div>
      ) : (
        <div className="profiles-grid">
          {filtered.map((profile, i) => (
            <motion.div
              key={profile.id}
              className="profile-card"
              style={{ cursor: "default" }}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.2 }}
            >
              <div className="profile-header">
                <div className="profile-info">
                  {profile.avatar ? (
                    <img src={profile.avatar} alt="" className="profile-avatar" style={{ objectFit: "cover", background: "none" }} />
                  ) : (
                    <div className="profile-avatar" style={{ background: "var(--surface)" }}>
                      {profile.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="profile-names">
                    <div className="profile-name">{profile.name}</div>
                    <div className="profile-handle">{profile.handle ? `@${profile.handle}` : profile.url}</div>
                  </div>
                </div>
                <div className="profile-actions">
                  <button onClick={(e) => { e.stopPropagation(); setEditingProfile(profile); setEditPrompt(profile.custom_prompt || ""); }} className="icon-btn" title="Editar prompt"><Pencil size={13} /></button>
                  <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(profile); }} className="icon-btn" title="Excluir"><Trash2 size={13} /></button>
                </div>
              </div>
              <div className="profile-stats">
                {profile.followers != null && (
                  <div>
                    <div className="stat-value">{formatCompactNumber(profile.followers)}</div>
                    <div className="stat-label">Seguidores</div>
                  </div>
                )}
                {profile.likes_total != null && (
                  <div>
                    <div className="stat-value">{formatCompactNumber(profile.likes_total)}</div>
                    <div className="stat-label">Curtidas</div>
                  </div>
                )}
                <div>
                  <div className="stat-value">{profile.max_videos}</div>
                  <div className="stat-label">Videos/coleta</div>
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="profile-tag" style={{ background: "linear-gradient(135deg, rgba(0,242,234,0.12), rgba(255,0,80,0.12))", color: "#00f2ea", border: "1px solid rgba(0,242,234,0.2)" }}>TikTok</span>
                  {profile.last_scraped_at && (
                    <span style={{ fontSize: 11, color: "var(--text-3)" }}>Coleta: {formatDate(profile.last_scraped_at)}</span>
                  )}
                </div>
                <button
                  className="btn-primary"
                  style={{ padding: "6px 14px", fontSize: 12 }}
                  onClick={(e) => handleScrape(e, profile)}
                  disabled={scrapingId === profile.id}
                >
                  {scrapingId === profile.id ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Scraping
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* New profile dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text-1)" }}>
          <DialogHeader><DialogTitle style={{ color: "var(--text-1)" }}>Novo perfil TikTok</DialogTitle></DialogHeader>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div><Label style={{ color: "var(--text-2)" }}>Nome</Label><Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Ex: MrBeast" style={inputStyle} /></div>
            <div><Label style={{ color: "var(--text-2)" }}>URL ou @handle</Label><Input value={formUrl} onChange={(e) => setFormUrl(e.target.value)} placeholder="Ex: @mrbeast ou https://www.tiktok.com/@mrbeast" style={inputStyle} /></div>
            <div><Label style={{ color: "var(--text-2)" }}>Max videos por coleta</Label><Input type="number" value={formMax} onChange={(e) => setFormMax(Number(e.target.value))} min={1} max={50} style={inputStyle} /></div>
            <div>
              <Label style={{ color: "var(--text-2)" }}>Prompt personalizado (opcional)</Label>
              <p style={{ fontSize: 11, color: "var(--text-3)", margin: "4px 0 6px" }}>Define a identidade, tom de voz e nicho para a IA readaptar o conteudo. Ex: "Perfil de fitness feminino, tom motivacional, publico: mulheres 25-40"</p>
              <Textarea value={formPrompt} onChange={(e) => setFormPrompt(e.target.value)} placeholder="Descreva quem e o cliente, tom de voz, nicho, publico-alvo..." rows={4} style={{ ...inputStyle, resize: "vertical", fontSize: 13 }} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleCreate} disabled={formLoading}>{formLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit prompt dialog */}
      <Dialog open={!!editingProfile} onOpenChange={(open) => { if (!open) setEditingProfile(null); }}>
        <DialogContent style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text-1)", maxWidth: 560 }}>
          <DialogHeader><DialogTitle style={{ color: "var(--text-1)" }}>Prompt de {editingProfile?.name}</DialogTitle></DialogHeader>
          <div>
            <p style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 10, lineHeight: 1.5 }}>
              Este prompt define como a IA vai analisar e readaptar o conteudo coletado deste perfil. Descreva a identidade do cliente, tom de voz, nicho e publico-alvo.
            </p>
            <Textarea
              value={editPrompt}
              onChange={(e) => setEditPrompt(e.target.value)}
              placeholder="Ex: Perfil do Gremio Futebol Clube. Tom: institucional e apaixonado. Nicho: futebol, esporte. Publico: torcedores gremistas. Pilares: bastidores, jogos, contratacoes, historia do clube."
              rows={8}
              style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-1)", borderRadius: "var(--radius)", resize: "vertical", fontSize: 13, width: "100%" }}
            />
            {editingProfile?.custom_prompt && (
              <button
                onClick={() => setEditPrompt("")}
                style={{ marginTop: 8, fontSize: 12, color: "var(--text-3)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
              >
                Limpar prompt
              </button>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingProfile(null)} style={{ border: "1px solid var(--border)", color: "var(--text-2)" }}>Cancelar</Button>
            <Button onClick={handleSavePrompt} disabled={editSaving}>{editSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
          <AlertDialogHeader>
            <AlertDialogTitle style={{ color: "var(--text-1)" }}>Excluir perfil?</AlertDialogTitle>
            <AlertDialogDescription style={{ color: "var(--text-2)" }}>Todos os posts e readaptados deste perfil serao excluidos.</AlertDialogDescription>
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
