import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Search, Play, Loader2, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
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
import { useAuth } from "@/contexts/AuthContext";
import { fetchBackend, getPublicBackendBaseUrl } from "@/lib/backendApi";
import {
  DEFAULT_RECENT_DAYS,
  RECENT_DAY_OPTIONS,
  buildOnlyPostsNewerThan,
  coerceRecentDays,
} from "@/lib/instagramScrape";

interface Props {
  selectedProfileId: string | null;
  onSelectProfile: (profile: InspirationProfile | null) => void;
}

export default function ProfileList({ selectedProfileId, onSelectProfile }: Props) {
  const { user, role } = useAuth();
  const { log } = useToolLogger();
  const [recentDays, setRecentDays] = useState(String(DEFAULT_RECENT_DAYS));
  const [profiles, setProfiles] = useState<InspirationProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [scrapingId, setScrapingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InspirationProfile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editTarget, setEditTarget] = useState<InspirationProfile | null>(null);

  const fetchProfiles = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("inspiration_profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (role !== "admin" && user?.id) {
        query = query.eq("user_id", user.id);
      }

      const { data, error } = await query;

      if (error) throw error;
      setProfiles(data || []);
    } catch (err: any) {
      toast.error(err.message || "Erro ao buscar perfis");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const startPolling = (profileId: string, initialCount: number, startedAt: string) => {
    stopPolling();
    let attempts = 0;
    const maxAttempts = 40; // 40 * 10s = ~6.5min

    pollingRef.current = setInterval(async () => {
      attempts++;
      try {
        const [{ count, error }, { data: profileData }] = await Promise.all([
          supabase
            .from("inspiration_posts")
            .select("*", { count: "exact", head: true })
            .eq("profile_id", profileId),
          supabase
            .from("inspiration_profiles")
            .select("last_scraped_at")
            .eq("id", profileId)
            .maybeSingle(),
        ]);

        if (error) throw error;

        const hasFreshScrape =
          typeof profileData?.last_scraped_at === "string" &&
          new Date(profileData.last_scraped_at).getTime() >= new Date(startedAt).getTime();

        if (hasFreshScrape || (count != null && count > initialCount)) {
          const newPosts = Math.max((count ?? initialCount) - initialCount, 0);
          const message = newPosts > 0
            ? `Scraping concluido! ${newPosts} novo(s) post(s) encontrado(s).`
            : "Scraping concluido! Os dados do perfil foram atualizados.";
          toast.dismiss(`scrape-${profileId}`);
          toast.success(message);
          fetchProfiles();
          stopPolling();
        }
      } catch {
        // silently retry
      }

      if (attempts >= maxAttempts) {
        toast.dismiss(`scrape-${profileId}`);
        toast.info("O scrapping ainda esta em andamento. Recarregue a pagina para verificar novos posts.");
        stopPolling();
      }
    }, 10000);
  };

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

      const { count: currentCount } = await supabase
        .from("inspiration_posts")
        .select("*", { count: "exact", head: true })
        .eq("profile_id", profile.id);
      const startedAt = new Date().toISOString();
      const days = coerceRecentDays(recentDays);
      const onlyPostsNewerThan = buildOnlyPostsNewerThan(days);

      const payload = {
        directUrls: allUrls,
        resultsType: "posts",
        resultsLimit: (profile.max_posts_per_url ?? 10) + 5,
        maxPostsPerUrl: (profile.max_posts_per_url ?? 10) + 5,
        onlyPostsNewerThan,
        profile_id: profile.id,
        backendUrl: getPublicBackendBaseUrl(),
        webhookPayload: {
          profile_id: profile.id,
          client_name: profile.client_name,
          own_instagram: profile.own_instagram,
          scrape_recent_days: days,
          ...(profile.custom_prompt?.trim() ? { custom_prompt: profile.custom_prompt.trim() } : {}),
        },
      };

      let started = false;

      try {
        const response = await fetchBackend("/instagram/collect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.detail || data.error || `HTTP ${response.status}`);
        }

        started = true;
      } catch (backendError) {
        const { error: apifyError } = await supabase.functions.invoke("apify-proxy", {
          body: payload,
        });

        if (apifyError) {
          const backendMessage = backendError instanceof Error ? backendError.message : null;
          throw new Error(
            backendMessage
              ? `${backendMessage}. Fallback Supabase: ${apifyError.message}`
              : apifyError.message,
          );
        }

        started = true;
      }

      if (!started) throw new Error("Nao foi possivel iniciar o scraping do Instagram");

      toast.success("Scraping iniciado com sucesso!");
      toast.loading("Aguardando o scrapper processar os perfis... Isso pode levar alguns minutos.", {
        id: `scrape-${profile.id}`,
        duration: Infinity,
      });

      startPolling(profile.id, currentCount ?? 0, startedAt);
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

  return (
    <div>
      {/* Search + New Profile */}
      <div className="insp-toolbar">
        <div className="search-wrap">
          <Search className="search-icon" size={15} />
          <input
            className="search-input"
            placeholder="Buscar perfil..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <label
          className="flex items-center gap-2 text-[12px]"
          style={{ color: "var(--text-3)", minHeight: 46 }}
        >
          <span style={{ whiteSpace: "nowrap" }}>Periodo</span>
          <select
            value={recentDays}
            onChange={(event) => setRecentDays(event.target.value)}
            className="field-input"
            style={{
              width: 150,
              minHeight: 46,
              padding: "0 12px",
              color: "var(--text-1)",
              outline: "none",
            }}
          >
            {RECENT_DAY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button className="btn-primary" onClick={() => setDialogOpen(true)}>
          <Plus size={15} /> Novo Perfil
        </button>
      </div>

      {/* Profile Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--text-3)" }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: "var(--surface)" }}
          >
            <Search className="w-4 h-4" style={{ color: "var(--text-3)" }} />
          </div>
          <p className="text-[13px]" style={{ color: "var(--text-3)" }}>
            Nenhum perfil encontrado.
          </p>
        </div>
      ) : (
        <div className="profiles-grid">
          {filtered.map((profile) => {
            const isSelected = selectedProfileId === profile.id;
            return (
              <div
                key={profile.id}
                onClick={() => onSelectProfile(isSelected ? null : profile)}
                className={`profile-card${isSelected ? " selected" : ""}`}
              >
                <div className="profile-card-inner">
                  <div className="profile-top">
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
                      <div className="profile-avatar">
                        {profile.avatar_url ? (
                          <img src={profile.avatar_url} alt={profile.client_name} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }} />
                        ) : (
                          (profile.client_name || "?").charAt(0).toUpperCase()
                        )}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div className="profile-name">{profile.client_name}</div>
                        <div className="profile-handle">@{profile.own_instagram}</div>
                      </div>
                    </div>
                    <div className="profile-actions">
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditTarget(profile); }}
                        className="icon-btn"
                        title="Editar"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(profile); }}
                        className="icon-btn"
                        title="Excluir"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  <div className="profile-stats">
                    <div>
                      <div className="stat-value">{profile.max_posts_per_url ?? 10}</div>
                      <div className="stat-label">Posts/perfil</div>
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span className="profile-tag">
                      {profile.instagram_handle || profile.own_instagram}
                    </span>
                    <button
                      className="btn-ghost"
                      onClick={(e) => handleScrape(e, profile)}
                      disabled={scrapingId === profile.id}
                    >
                      {scrapingId === profile.id ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Play size={13} />
                      )}
                      Scraping
                    </button>
                  </div>
                </div>
              </div>
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
            background: "var(--dialog-bg)",
            border: "1px solid var(--border)",
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle style={{ color: "var(--text-1)" }}>
              Excluir perfil
            </AlertDialogTitle>
            <AlertDialogDescription style={{ color: "var(--text-2)" }}>
              Tem certeza que deseja excluir o perfil{" "}
              <strong style={{ color: "var(--text-1)" }}>{deleteTarget?.client_name}</strong>?
              Todos os alvos e posts relacionados serao removidos.
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
              style={{ background: "#ef4444", color: "#fff" }}
            >
              {deleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
