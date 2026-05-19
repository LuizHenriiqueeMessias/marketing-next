import { useEffect, useRef, useState, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, Folder, Hash, Loader2, MessageSquare, Play, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { fetchBackend, getPublicBackendBaseUrl } from "@/lib/backendApi";
import {
  DEFAULT_RECENT_DAYS,
  RECENT_DAY_OPTIONS,
  buildOnlyPostsNewerThan,
  coerceRecentDays,
  parseHashtags,
} from "@/lib/instagramScrape";

type Profile = {
  id: string;
  client_name: string;
  own_instagram: string;
  custom_prompt: string | null;
};

type HashtagCollection = {
  id: string;
  profile_id: string;
  hashtags: string[] | null;
  scrape_recent_days: number | null;
  posts_per_tag: number | null;
  status: string | null;
  posts_count: number | null;
  created_at: string;
};

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function InstagramHashtags() {
  const { user, role } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [hashtagsText, setHashtagsText] = useState("");
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [recentDays, setRecentDays] = useState(String(DEFAULT_RECENT_DAYS));
  const [maxPostsPerTag, setMaxPostsPerTag] = useState("20");
  const [customPrompt, setCustomPrompt] = useState("");
  const [scraping, setScraping] = useState(false);
  const [collections, setCollections] = useState<HashtagCollection[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const [view, setView] = useState<"scrap" | "coletas">(
    searchParams.get("tab") === "coletas" ? "coletas" : "scrap",
  );
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? null;

  const hasUsableHashtags = hashtags.length > 0 || parseHashtags(hashtagsText).length > 0;
  const startDisabledReason = !selectedProfileId
    ? "Selecione um perfil destino acima."
    : !hasUsableHashtags
      ? "Digite ao menos uma hashtag (uma por linha) na caixa acima."
      : null;

  const fetchProfiles = async () => {
    setLoadingProfiles(true);
    try {
      let query = supabase
        .from("inspiration_profiles")
        .select("id, client_name, own_instagram, custom_prompt")
        .order("client_name", { ascending: true });

      if (role !== "admin" && user?.id) {
        query = query.eq("user_id", user.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      setProfiles((data || []) as Profile[]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao buscar perfis";
      toast.error(message);
    } finally {
      setLoadingProfiles(false);
    }
  };

  const fetchCollections = useCallback(async () => {
    try {
      let query = supabase
        .from("hashtag_collections")
        .select("id, profile_id, hashtags, scrape_recent_days, posts_per_tag, status, posts_count, created_at")
        .order("created_at", { ascending: false })
        .limit(30);

      if (selectedProfileId) {
        query = query.eq("profile_id", selectedProfileId);
      } else if (role !== "admin" && user?.id) {
        query = query.eq("user_id", user.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      setCollections((data || []) as HashtagCollection[]);
    } catch {
      // lista de historico nao e critica
      setCollections([]);
    }
  }, [selectedProfileId, role, user?.id]);

  useEffect(() => {
    fetchProfiles();
  }, []);

  useEffect(() => {
    fetchCollections();
  }, [fetchCollections]);

  useEffect(() => {
    setCustomPrompt(selectedProfile?.custom_prompt || "");
  }, [selectedProfileId, selectedProfile?.custom_prompt]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const startPolling = (profileId: string, initialCount: number, startedAt: string) => {
    stopPolling();
    let attempts = 0;
    const maxAttempts = 40;

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
          toast.dismiss("scrape-hashtags");
          toast.success(
            newPosts > 0
              ? `Scraping concluido! ${newPosts} novo(s) post(s) encontrado(s).`
              : "Scraping concluido! Os dados foram atualizados.",
          );
          stopPolling();
          fetchCollections();
        }
      } catch {
        // retry silently
      }

      // mantem o historico de coletas atualizado enquanto o scrape roda
      fetchCollections();

      if (attempts >= maxAttempts) {
        toast.dismiss("scrape-hashtags");
        toast.info("O scrapping ainda esta em andamento. Recarregue a pagina para verificar novos posts.");
        stopPolling();
        fetchCollections();
      }
    }, 10000);
  };

  const handleAddHashtags = () => {
    const parsed = parseHashtags(hashtagsText);
    if (parsed.length === 0) {
      toast.error("Insira pelo menos uma hashtag");
      return;
    }

    const existing = new Set(hashtags);
    const next = parsed.filter((tag) => !existing.has(tag));
    if (next.length === 0) {
      toast.info("Todas as hashtags ja foram adicionadas");
      return;
    }

    setHashtags((current) => [...current, ...next]);
    setHashtagsText("");
    toast.success(`${next.length} hashtag(s) adicionada(s)`);
  };

  const handleRemoveHashtag = (tag: string) => {
    setHashtags((current) => current.filter((item) => item !== tag));
  };

  const handleStartScraping = async () => {
    if (!selectedProfile) {
      toast.error("Selecione um perfil destino");
      return;
    }

    // Aceita hashtags digitadas na caixa mesmo que o usuario nao tenha clicado
    // em "Adicionar hashtags" antes.
    let effectiveHashtags = hashtags;
    const pendingFromTextarea = parseHashtags(hashtagsText);
    if (pendingFromTextarea.length > 0) {
      const merged = [...hashtags];
      for (const tag of pendingFromTextarea) {
        if (!merged.includes(tag)) merged.push(tag);
      }
      effectiveHashtags = merged;
      setHashtags(merged);
      setHashtagsText("");
    }

    if (effectiveHashtags.length === 0) {
      toast.error("Adicione pelo menos uma hashtag");
      return;
    }

    const days = coerceRecentDays(recentDays);
    const maxPosts = coerceRecentDays(maxPostsPerTag, 20);
    const onlyPostsNewerThan = buildOnlyPostsNewerThan(days);
    const directUrls = effectiveHashtags.map((tag) => `https://www.instagram.com/explore/tags/${tag}/`);

    setScraping(true);
    try {
      const { count: currentCount } = await supabase
        .from("inspiration_posts")
        .select("*", { count: "exact", head: true })
        .eq("profile_id", selectedProfile.id);
      const startedAt = new Date().toISOString();

      // Cria a "pasta" (coleta de hashtag) — agrupa os posts que vierem desse scrape
      let collectionId: string | null = null;
      try {
        const collPayload = {
          profile_id: selectedProfile.id,
          user_id: user?.id ?? null,
          hashtags: effectiveHashtags,
          scrape_recent_days: days,
          posts_per_tag: maxPosts,
          status: "processing",
        };
        console.log("[hashtag-collections] tentando inserir", collPayload, "user.id=", user?.id);
        const { data: coll, error: collErr } = await supabase
          .from("hashtag_collections")
          .insert(collPayload as any)
          .select("id")
          .single();
        if (collErr) throw collErr;
        if (!coll?.id) throw new Error("insert OK mas sem id retornado");
        collectionId = coll.id;
        console.log("[hashtag-collections] criada", collectionId);
      } catch (collErr: any) {
        // Sem a "pasta" o scrape ainda funciona — os posts so nao ficam agrupados.
        const detail = collErr?.message || collErr?.error_description || collErr?.hint || String(collErr);
        const code = collErr?.code || collErr?.status || "";
        console.error("[hashtag-collections] FALHA NO INSERT", { error: collErr, code, detail });
        toast.error(`Nao consegui registrar a pasta da coleta. ${code ? `[${code}] ` : ""}${detail}`, {
          duration: 10000,
        });
      }

      const payload = {
        directUrls,
        resultsType: "posts",
        resultsLimit: Math.max(effectiveHashtags.length * maxPosts, maxPosts),
        maxPostsPerUrl: maxPosts,
        onlyPostsNewerThan,
        profile_id: selectedProfile.id,
        backendUrl: getPublicBackendBaseUrl(),
        webhookPayload: {
          profile_id: selectedProfile.id,
          client_name: selectedProfile.client_name,
          own_instagram: selectedProfile.own_instagram,
          source: "hashtag",
          hashtags: effectiveHashtags,
          scrape_recent_days: days,
          ...(collectionId ? { hashtag_collection_id: collectionId } : {}),
          ...(customPrompt.trim() ? { custom_prompt: customPrompt.trim() } : {}),
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
        const { error } = await supabase.functions.invoke("apify-proxy", {
          body: payload,
        });

        if (error) {
          const backendMessage = backendError instanceof Error ? backendError.message : null;
          throw new Error(
            backendMessage
              ? `${backendMessage}. Fallback Supabase: ${error.message}`
              : error.message,
          );
        }

        started = true;
      }

      if (!started) throw new Error("Nao foi possivel iniciar o scraping por hashtag");
      toast.success(`Scraping iniciado: ${effectiveHashtags.length} hashtag(s)`);
      toast.loading("Aguardando o scrapper processar as hashtags... Isso pode levar alguns minutos.", {
        id: "scrape-hashtags",
        duration: Infinity,
      });
      startPolling(selectedProfile.id, currentCount ?? 0, startedAt);
      fetchCollections();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao iniciar scraping";
      toast.error(message);
    } finally {
      setScraping(false);
    }
  };

  const handleDeleteCollection = async (id: string, tags: string[] | null) => {
    const label = tags && tags.length > 0 ? `#${tags.join(" #")}` : "esta coleta";
    const ok = window.confirm(
      `Excluir a pasta ${label}?\n\nOs posts continuam em Inspiracao — so o agrupamento por hashtag e removido.`,
    );
    if (!ok) return;
    try {
      const { error } = await supabase.from("hashtag_collections").delete().eq("id", id);
      if (error) throw error;
      toast.success("Coleta excluida");
      fetchCollections();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao excluir";
      toast.error(`Nao consegui excluir: ${msg}`);
    }
  };

  return (
    <div className="flex flex-col flex-1">
      <div className="page-header">
        <div className="page-header-icon">
          <Hash className="w-[18px] h-[18px]" style={{ color: "var(--accent)" }} />
        </div>
        <div>
          <h1 className="page-header-title" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700 }}>
            Hashtags
          </h1>
          <p className="page-header-sub">Scrappear posts do Instagram por hashtag e periodo</p>
        </div>
      </div>

      <div className="page-content" style={{ display: "flex", justifyContent: "center" }}>
        <div className="w-full max-w-[720px] space-y-4">
          {/* Sub-abas: Scrappear | Coletas */}
          <div className="flex items-end gap-6 -mb-px" style={{ borderBottom: "1px solid var(--border)" }}>
            {(
              [
                { key: "scrap" as const, label: "Scrappear", Icon: Play, count: null as number | null },
                { key: "coletas" as const, label: "Coletas", Icon: Folder, count: collections.length },
              ]
            ).map(({ key, label, Icon, count }) => {
              const active = view === key;
              return (
                <button
                  key={key}
                  onClick={() => {
                    setView(key);
                    const next = new URLSearchParams(searchParams);
                    if (key === "scrap") next.delete("tab"); else next.set("tab", "coletas");
                    setSearchParams(next, { replace: true });
                  }}
                  className="flex items-center gap-2 pb-2.5 text-[13px] transition-colors"
                  style={{
                    color: active ? "var(--accent)" : "var(--text-3)",
                    borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
                    fontWeight: active ? 600 : 500,
                  }}
                >
                  <Icon className="w-3.5 h-3.5" /> {label}
                  {count !== null && count > 0 ? (
                    <span
                      className="text-[11px] px-1.5 py-0.5 rounded-md"
                      style={{
                        background: active ? "rgba(232,96,74,.15)" : "var(--surface)",
                        color: active ? "var(--accent)" : "var(--text-3)",
                      }}
                    >
                      {count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {view === "scrap" && (<>
          <div className="form-card">
            <div className="form-card-title">Perfil destino</div>
            <Select value={selectedProfileId} onValueChange={setSelectedProfileId}>
              <SelectTrigger className="h-10 text-[13px] px-4">
                <SelectValue placeholder={loadingProfiles ? "Carregando..." : "Selecione um perfil"} />
              </SelectTrigger>
              <SelectContent>
                {profiles.map((profile) => (
                  <SelectItem key={profile.id} value={profile.id} className="text-[13px]">
                    {profile.client_name} - @{profile.own_instagram}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="form-card">
            <div className="form-card-title">Hashtags</div>
            <Textarea
              value={hashtagsText}
              onChange={(event) => setHashtagsText(event.target.value)}
              placeholder={"marketing\ncriativos\nvendas"}
              rows={5}
              className="text-[13px] resize-none"
            />
            <button
              onClick={handleAddHashtags}
              disabled={!hashtagsText.trim()}
              className="btn-ghost mt-3 disabled:opacity-40"
            >
              <Hash className="w-3.5 h-3.5" /> Adicionar hashtags
            </button>
          </div>

          {hashtags.length > 0 && (
            <div className="form-card !p-0">
              <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
                <span className="form-card-title !mb-0">Hashtags adicionadas ({hashtags.length})</span>
              </div>
              <div className="p-5 flex flex-wrap gap-2">
                <AnimatePresence initial={false}>
                  {hashtags.map((tag) => (
                    <motion.span
                      key={tag}
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      className="badge"
                      style={{ background: "rgba(232,96,74,.1)", color: "var(--accent)", border: "1px solid rgba(232,96,74,.2)" }}
                    >
                      #{tag}
                      <button onClick={() => handleRemoveHashtag(tag)} className="ml-1 opacity-70 hover:opacity-100">
                        <X className="w-3 h-3" />
                      </button>
                    </motion.span>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}

          <div className="form-card">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2 text-[12px]" style={{ color: "var(--text-3)" }}>
                <span>Periodo</span>
                <Select value={recentDays} onValueChange={setRecentDays}>
                  <SelectTrigger className="h-[42px] text-[13px] px-4">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RECENT_DAY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value} className="text-[13px]">
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <label className="grid gap-2 text-[12px]" style={{ color: "var(--text-3)" }}>
                Posts por hashtag
                <input
                  value={maxPostsPerTag}
                  onChange={(event) => setMaxPostsPerTag(event.target.value)}
                  type="number"
                  min={1}
                  max={100}
                  className="field-input"
                  style={{ minHeight: 42, padding: "0 12px", color: "var(--text-1)", outline: "none" }}
                />
              </label>
            </div>
          </div>

          <div className="form-card">
            <div className="form-card-title">
              <MessageSquare className="w-3.5 h-3.5" />
              Prompt personalizado (opcional)
            </div>
            <Textarea
              value={customPrompt}
              onChange={(event) => setCustomPrompt(event.target.value)}
              onBlur={async (event) => {
                if (!selectedProfileId) return;
                try {
                  await supabase
                    .from("inspiration_profiles")
                    .update({ custom_prompt: event.target.value } as any)
                    .eq("id", selectedProfileId);
                } catch {}
              }}
              placeholder="Ex: Analise os posts focando em criativos para conversao no nicho do cliente..."
              rows={4}
              className="text-[13px] resize-none"
            />
          </div>

          <button
            onClick={handleStartScraping}
            disabled={!!startDisabledReason || scraping}
            className="btn-cta disabled:opacity-40"
          >
            <span className="flex items-center justify-center gap-2">
              {scraping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {scraping ? "Iniciando scraping..." : "Iniciar Scraping por Hashtag"}
            </span>
          </button>

          {startDisabledReason && !scraping ? (
            <p className="text-[12px] text-center" style={{ color: "var(--text-3)" }}>
              {startDisabledReason}
            </p>
          ) : null}

          {profiles.length === 0 && !loadingProfiles ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "var(--surface)" }}>
                <Search className="w-4 h-4" style={{ color: "var(--text-3)" }} />
              </div>
              <p className="text-[13px]" style={{ color: "var(--text-3)" }}>
                Crie um perfil antes de scrappear hashtags.
              </p>
            </div>
          ) : null}
          </>)}

          {view === "coletas" && (
            collections.length === 0 ? (
              <div className="form-card text-center py-12 flex flex-col items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "var(--surface)" }}>
                  <Folder className="w-4 h-4" style={{ color: "var(--text-3)" }} />
                </div>
                <p className="text-[13px]" style={{ color: "var(--text-3)" }}>
                  Nenhuma coleta {selectedProfileId ? "deste perfil " : ""}ainda.
                </p>
                <button
                  onClick={() => setView("scrap")}
                  className="btn-ghost"
                >
                  <Play className="w-3.5 h-3.5" /> Criar a primeira
                </button>
              </div>
            ) : (
              <div className="form-card !p-0">
                <div className="px-5 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid var(--border)" }}>
                  <Folder className="w-3.5 h-3.5" style={{ color: "var(--text-3)" }} />
                  <span className="form-card-title !mb-0">
                    Coletas por hashtag {selectedProfileId ? "(deste perfil)" : ""} ({collections.length})
                  </span>
                </div>
                <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                  {collections.map((coll) => {
                    const statusColor =
                      coll.status === "done"
                        ? { bg: "rgba(34,197,94,.12)", fg: "rgb(34,197,94)" }
                        : coll.status === "error"
                          ? { bg: "rgba(239,68,68,.12)", fg: "rgb(239,68,68)" }
                          : { bg: "rgba(234,179,8,.12)", fg: "rgb(234,179,8)" };
                    const statusLabel =
                      coll.status === "done" ? "concluida" : coll.status === "error" ? "erro" : "processando";
                    return (
                      <div key={coll.id} className="flex items-stretch hover:bg-[rgba(255,255,255,0.02)] transition-colors">
                        <Link
                          to={`/instagram-hashtags/${coll.id}`}
                          className="flex-1 px-5 py-3 flex flex-col gap-2"
                          style={{ textDecoration: "none", color: "inherit" }}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-[12px]" style={{ color: "var(--text-3)" }}>
                              {formatDateTime(coll.created_at)}
                              {coll.scrape_recent_days ? ` · ult. ${coll.scrape_recent_days} dias` : ""}
                            </span>
                            <span className="flex items-center gap-1.5">
                              <span
                                className="badge"
                                style={{ background: statusColor.bg, color: statusColor.fg, border: `1px solid ${statusColor.bg}` }}
                              >
                                {statusLabel}
                                {typeof coll.posts_count === "number" ? ` · ${coll.posts_count} posts` : ""}
                              </span>
                              <ChevronRight className="w-3.5 h-3.5" style={{ color: "var(--text-3)" }} />
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {(coll.hashtags || []).map((tag) => (
                              <span
                                key={tag}
                                className="badge"
                                style={{ background: "rgba(232,96,74,.1)", color: "var(--accent)", border: "1px solid rgba(232,96,74,.2)" }}
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>
                        </Link>
                        <button
                          onClick={() => handleDeleteCollection(coll.id, coll.hashtags)}
                          className="px-3 flex items-center justify-center hover:bg-[rgba(239,68,68,.08)] transition-colors"
                          title="Excluir pasta"
                          style={{ borderLeft: "1px solid var(--border)" }}
                        >
                          <Trash2 className="w-3.5 h-3.5" style={{ color: "rgb(239,68,68)" }} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
