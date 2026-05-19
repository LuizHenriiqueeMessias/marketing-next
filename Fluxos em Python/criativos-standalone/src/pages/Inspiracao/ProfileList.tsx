import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Search, Play, Loader2, Trash2, Pencil, MessageSquare } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { motion } from "framer-motion";
import type { InspirationProfile, InspirationTarget } from "./types";
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
import NewProfileDialog from "./NewProfileDialog";
import EditProfileDialog from "./EditProfileDialog";
import { useToolLogger } from "@/hooks/useToolLogger";

interface Props {
  selectedProfileId: string | null;
  onSelectProfile: (profile: InspirationProfile | null) => void;
}

export default function ProfileList({ selectedProfileId, onSelectProfile }: Props) {
  const { log } = useToolLogger();
  const [profiles, setProfiles] = useState<InspirationProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [scrapingId, setScrapingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InspirationProfile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editTarget, setEditTarget] = useState<InspirationProfile | null>(null);
  const [prompts, setPrompts] = useState<Record<string, string>>({});

  const fetchProfiles = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("inspiration_profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setProfiles(data || []);
      // Initialize prompts from saved data
      const initial: Record<string, string> = {};
      for (const p of data || []) {
        if (p.custom_prompt) initial[p.id] = p.custom_prompt;
      }
      setPrompts((prev) => ({ ...initial, ...prev }));
    } catch (err: any) {
      toast.error(err.message || "Erro ao buscar perfis");
    } finally {
      setLoading(false);
    }
  };

  const savePrompt = async (profileId: string, value: string) => {
    setPrompts((prev) => ({ ...prev, [profileId]: value }));
    try {
      const { error } = await supabase
        .from("inspiration_profiles")
        .update({ custom_prompt: value } as any)
        .eq("id", profileId);
      if (error) throw error;
    } catch (err: any) {
      toast.error("Erro ao salvar prompt");
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  const handleScrape = async (e: React.MouseEvent, profile: InspirationProfile) => {
    e.stopPropagation();
    setScrapingId(profile.id);

    try {
      const { data: targets, error } = await supabase
        .from("inspiration_targets")
        .select("instagram_url")
        .eq("profile_id", profile.id);

      if (error) throw error;

      const urls = (targets as InspirationTarget[]).map(
        (t) => `https://www.instagram.com/${t.instagram_url}/`
      );

      // Add individual post URLs from profile
      const postUrls = (profile.post_urls || []).filter((u) => u.trim().length > 0);
      const allUrls = [...urls, ...postUrls];

      if (allUrls.length === 0) {
        toast.error("Nenhum perfil-alvo ou post cadastrado para scrappear");
        return;
      }

      const { error: apifyError } = await supabase.functions.invoke("apify-proxy", {
        body: {
          directUrls: allUrls,
          resultsType: "posts",
          resultsLimit: profile.max_posts_per_url ?? 10,
          maxPostsPerUrl: profile.max_posts_per_url ?? 10,
          profile_id: profile.id,
          webhookPayload: {
            profile_id: profile.id,
            client_name: profile.client_name,
            own_instagram: profile.own_instagram,
            ...(prompts[profile.id]?.trim() ? { custom_prompt: prompts[profile.id].trim() } : {}),
          },
        },
      });

      if (apifyError) throw new Error(apifyError.message);

      toast.success("Scraping iniciado com sucesso!");
    } catch (err: any) {
      toast.error(err.message || "Erro ao iniciar scraping");
    } finally {
      setScrapingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from("inspiration_profiles")
        .delete()
        .eq("id", deleteTarget.id);

      if (error) throw error;
      toast.success("Perfil excluido com sucesso!");
      log({ toolId: "criativos-inspiracao", actionType: "record_delete", actionDetail: `Excluiu perfil "${deleteTarget.own_instagram}"`, metadata: { profileId: deleteTarget.id, instagram: deleteTarget.own_instagram } });
      setDeleteTarget(null);
      fetchProfiles();
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir perfil");
    } finally {
      setDeleting(false);
    }
  };

  const filtered = profiles.filter((p) => {
    const q = search.toLowerCase();
    return (
      p.client_name.toLowerCase().includes(q) ||
      p.own_instagram?.toLowerCase().includes(q) ||
      p.instagram_handle?.toLowerCase().includes(q)
    );
  });

  const f = "var(--cr-font)";

  return (
    <div className="space-y-4" style={{ fontFamily: f }}>
      {/* Search + New Profile */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
            style={{ color: "var(--cr-text-3)" }}
          />
          <Input
            placeholder="Buscar perfil..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-[13px]"
            style={{
              background: "var(--cr-surface)",
              border: "1px solid var(--cr-border)",
              color: "var(--cr-text-1)",
              fontFamily: f,
              borderRadius: "var(--cr-radius)",
            }}
          />
        </div>
        <Button
          onClick={() => setDialogOpen(true)}
          className="gap-1.5 h-9 text-[12px] font-semibold border-none"
          style={{
            background: "var(--cr-grad)",
            color: "#fff",
            fontFamily: f,
            borderRadius: "var(--cr-radius-sm)",
            boxShadow: "0 0 20px rgba(194,57,110, 0.30)",
            padding: "7px 14px",
          }}
        >
          <Plus className="w-3.5 h-3.5" /> Novo Perfil
        </Button>
      </div>

      {/* Profile Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--cr-text-3)" }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: "var(--cr-surface)" }}
          >
            <Search className="w-4 h-4" style={{ color: "var(--cr-text-3)" }} />
          </div>
          <p className="text-[13px]" style={{ color: "var(--cr-text-3)" }}>
            Nenhum perfil encontrado.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((profile) => {
            const isSelected = selectedProfileId === profile.id;
            return (
              <motion.div
                key={profile.id}
                whileHover={{ y: -1 }}
                transition={{ duration: 0.15 }}
                onClick={() => onSelectProfile(isSelected ? null : profile)}
                className="cursor-pointer p-5 transition-all group"
                style={{
                  background: isSelected ? "var(--cr-accent-muted)" : "var(--cr-surface-2)",
                  border: `1px solid ${isSelected ? "var(--cr-accent-border)" : "var(--cr-border)"}`,
                  borderRadius: "var(--cr-radius-lg)",
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor = "rgba(232,96,74, 0.25)";
                    e.currentTarget.style.boxShadow = "0 8px 32px rgba(0,0,0, 0.40)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor = "var(--cr-border)";
                    e.currentTarget.style.boxShadow = "none";
                  }
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-[42px] h-[42px] rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: "var(--cr-grad)" }}
                    >
                      <span className="text-base font-bold text-white">
                        {(profile.client_name || "?").charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p
                        className="font-semibold text-[13px] truncate"
                        style={{ color: "var(--cr-text-1)" }}
                      >
                        {profile.client_name}
                      </p>
                      <p
                        className="text-xs truncate mt-0.5"
                        style={{ color: "var(--cr-text-2)" }}
                      >
                        @{profile.own_instagram}
                      </p>
                    </div>
                  </div>
                  <div className="flex-shrink-0 ml-3 flex items-center gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditTarget(profile); }}
                      className="p-1.5 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
                      style={{ color: "var(--cr-text-3)" }}
                      title="Editar"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => handleScrape(e, profile)}
                      disabled={scrapingId === profile.id}
                      className="p-1.5 rounded-lg transition-colors disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
                      style={{ color: "var(--cr-text-3)" }}
                      title="Scrappear"
                    >
                      {scrapingId === profile.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Play className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(profile); }}
                      className="p-1.5 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
                      style={{ color: "var(--cr-text-3)" }}
                      title="Excluir"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <p
                  className="text-[11px] mt-2"
                  style={{ color: "var(--cr-text-3)" }}
                >
                  {profile.max_posts_per_url ?? 10} posts/perfil
                </p>

                {/* Prompt field inside selected card */}
                {isSelected && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="mt-3 space-y-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-1.5">
                      <MessageSquare className="w-3 h-3" style={{ color: "var(--cr-text-3)" }} />
                      <span
                        className="text-[10px] font-semibold uppercase tracking-wider"
                        style={{ color: "var(--cr-text-3)" }}
                      >
                        Prompt personalizado
                      </span>
                    </div>
                    <Textarea
                      value={prompts[profile.id] || ""}
                      onChange={(e) =>
                        setPrompts((prev) => ({ ...prev, [profile.id]: e.target.value }))
                      }
                      onBlur={(e) => savePrompt(profile.id, e.target.value)}
                      placeholder="Ex: Foque em estrategias de engajamento para moda feminina..."
                      rows={3}
                      className="text-[12px] resize-none"
                      style={{
                        background: "rgba(0,0,0,0.3)",
                        border: "1px solid var(--cr-border)",
                        color: "var(--cr-text-1)",
                        borderRadius: "var(--cr-radius-sm)",
                        fontFamily: f,
                      }}
                    />
                    <p className="text-[10px]" style={{ color: "var(--cr-text-3)" }}>
                      Opcional — sera enviado ao N8N para personalizar a analise.
                    </p>
                  </motion.div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      <NewProfileDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={fetchProfiles}
      />

      <EditProfileDialog
        profile={editTarget}
        open={!!editTarget}
        onOpenChange={(open) => !open && setEditTarget(null)}
        onSaved={fetchProfiles}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent
          style={{
            background: "var(--cr-dialog-bg)",
            border: "1px solid var(--cr-border)",
            fontFamily: f,
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle style={{ color: "var(--cr-text-1)" }}>
              Excluir perfil
            </AlertDialogTitle>
            <AlertDialogDescription style={{ color: "var(--cr-text-2)" }}>
              Tem certeza que deseja excluir o perfil{" "}
              <strong style={{ color: "var(--cr-text-1)" }}>{deleteTarget?.client_name}</strong>?
              Todos os alvos e posts relacionados serao removidos.
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
              disabled={deleting}
              style={{ background: "var(--cr-red)", color: "#fff" }}
            >
              {deleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
