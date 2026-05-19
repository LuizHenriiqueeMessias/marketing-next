import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link, Play, Loader2, X, CheckCircle, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { fetchBackend, getPublicBackendBaseUrl } from "@/lib/backendApi";

interface Profile {
  id: string;
  client_name: string;
  own_instagram: string;
  custom_prompt: string | null;
  last_scraped_at?: string | null;
}

interface UrlEntry {
  id: string;
  url: string;
  status: "pendente" | "processando" | "concluido";
}

export default function ScrappingEspecifico() {
  const { user, role } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");
  const [urlText, setUrlText] = useState("");
  const [urls, setUrls] = useState<UrlEntry[]>([]);
  const [customPrompt, setCustomPrompt] = useState("");
  const [scraping, setScraping] = useState(false);

  useEffect(() => {
    fetchProfiles();
  }, []);

  useEffect(() => {
    const profile = profiles.find((p) => p.id === selectedProfileId);
    setCustomPrompt(profile?.custom_prompt || "");
  }, [selectedProfileId, profiles]);

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
      setProfiles(data || []);
    } catch (err: any) {
      toast.error(err.message || "Erro ao buscar perfis");
    } finally {
      setLoadingProfiles(false);
    }
  };

  const handleAddUrls = () => {
    const lines = urlText.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length === 0) { toast.error("Insira pelo menos uma URL"); return; }
    const invalid = lines.filter((l) => !l.includes("instagram.com"));
    if (invalid.length > 0) { toast.error(`${invalid.length} URL(s) invalida(s) - devem conter instagram.com`); return; }
    const existingUrls = new Set(urls.map((u) => u.url));
    const newEntries: UrlEntry[] = lines
      .filter((l) => !existingUrls.has(l))
      .map((url) => ({ id: crypto.randomUUID(), url, status: "pendente" as const }));
    if (newEntries.length === 0) { toast.info("Todas as URLs ja foram adicionadas"); return; }
    setUrls((prev) => [...prev, ...newEntries]);
    setUrlText("");
    toast.success(`${newEntries.length} URL(s) adicionada(s)`);
  };

  const handleRemoveUrl = (id: string) => {
    setUrls((prev) => prev.filter((u) => u.id !== id));
  };

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
          const message = newPosts > 0
            ? `Scraping concluido! ${newPosts} novo(s) post(s) encontrado(s).`
            : "Scraping concluido! Os dados das URLs foram atualizados.";
          toast.dismiss("scrape-especifico");
          toast.success(message);
          setUrls((prev) => prev.map((u) => u.status === "processando" ? { ...u, status: "concluido" as const } : u));
          stopPolling();
        }
      } catch {
        // silently retry
      }

      if (attempts >= maxAttempts) {
        toast.dismiss("scrape-especifico");
        toast.info("O scrapping ainda esta em andamento. Recarregue a pagina para verificar novos posts.");
        stopPolling();
      }
    }, 10000);
  };

  const handleStartScraping = async () => {
    const profile = profiles.find((p) => p.id === selectedProfileId);
    if (!profile) { toast.error("Selecione um perfil"); return; }
    const pendingUrls = urls.filter((u) => u.status === "pendente").map((u) => u.url);
    if (pendingUrls.length === 0) { toast.error("Nenhuma URL pendente para scrappear"); return; }
    setScraping(true);
    setUrls((prev) => prev.map((u) => u.status === "pendente" ? { ...u, status: "processando" as const } : u));
    try {
      // Get current post count before polling
      const { count: currentCount } = await supabase
        .from("inspiration_posts")
        .select("*", { count: "exact", head: true })
        .eq("profile_id", profile.id);
      const startedAt = new Date().toISOString();

      const payload = {
        directUrls: pendingUrls,
        resultsType: "posts",
        resultsLimit: pendingUrls.length,
        profile_id: profile.id,
        backendUrl: getPublicBackendBaseUrl(),
        webhookPayload: {
          profile_id: profile.id,
          client_name: profile.client_name,
          own_instagram: profile.own_instagram,
          source: "specific",
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

      if (!started) throw new Error("Nao foi possivel iniciar o scraping do Instagram");
      toast.success(`Scraping iniciado: ${pendingUrls.length} URL(s)`);
      toast.loading("Aguardando o scrapper processar as URLs... Isso pode levar alguns minutos.", {
        id: "scrape-especifico",
        duration: Infinity,
      });

      startPolling(profile.id, currentCount ?? 0, startedAt);
    } catch (err: any) {
      toast.error(err.message || "Erro ao iniciar scraping");
      setUrls((prev) => prev.map((u) => u.status === "processando" ? { ...u, status: "pendente" as const } : u));
    } finally {
      setScraping(false);
    }
  };

  const hasPending = urls.some((u) => u.status === "pendente");

  return (
    <div className="flex flex-col flex-1">
      {/* Page header */}
      <div className="page-header">
        <div className="page-header-icon">
          <Link className="w-[18px] h-[18px]" style={{ color: "var(--accent)" }} />
        </div>
        <div>
          <h1 className="page-header-title" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700 }}>Scrapping Especifico</h1>
          <p className="page-header-sub">Scrappear posts especificos do Instagram por URL</p>
        </div>
      </div>

      <div className="page-content" style={{ display: "flex", justifyContent: "center" }}>
        <div className="w-full max-w-[660px] space-y-4">
          {/* Profile selector */}
          <div className="form-card">
            <div className="form-card-title">Perfil</div>
            <Select value={selectedProfileId} onValueChange={setSelectedProfileId}>
              <SelectTrigger className="h-10 text-[13px] px-4">
                <SelectValue placeholder={loadingProfiles ? "Carregando..." : "Selecione um perfil"} />
              </SelectTrigger>
              <SelectContent>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="text-[13px]">
                    {p.client_name} — @{p.own_instagram}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* URL input */}
          <div className="form-card">
            <div className="form-card-title">URLs do Instagram (uma por linha)</div>
            <Textarea
              value={urlText}
              onChange={(e) => setUrlText(e.target.value)}
              placeholder={"https://www.instagram.com/p/...\nhttps://www.instagram.com/reel/..."}
              rows={5}
              className="text-[13px] resize-none"
            />
            <button
              onClick={handleAddUrls}
              disabled={!urlText.trim()}
              className="btn-ghost mt-3 disabled:opacity-40"
            >
              <Link className="w-3.5 h-3.5" /> Adicionar URLs
            </button>
          </div>

          {/* URL list */}
          {urls.length > 0 && (
            <div className="form-card !p-0">
              <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
                <span className="form-card-title !mb-0">URLs adicionadas ({urls.length})</span>
              </div>
              <AnimatePresence>
                {urls.map((entry) => (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-center gap-3 px-5 py-3"
                    style={{ borderBottom: "1px solid var(--border)" }}
                  >
                    {entry.status === "pendente" && (
                      <span className="badge" style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)" }}>pendente</span>
                    )}
                    {entry.status === "processando" && (
                      <span className="badge animate-pulse" style={{ background: "rgba(6,182,212,0.12)", color: "#06b6d4", border: "1px solid rgba(6,182,212,.2)" }}>processando</span>
                    )}
                    {entry.status === "concluido" && (
                      <span className="badge" style={{ background: "rgba(232,96,74,.1)", color: "var(--accent)", border: "1px solid rgba(232,96,74,.2)" }}>
                        <CheckCircle className="w-3 h-3" /> concluido
                      </span>
                    )}
                    <span className="text-[12px] truncate min-w-0 flex-1" style={{ color: "var(--text-2)" }} title={entry.url}>{entry.url}</span>
                    {entry.status === "pendente" && (
                      <button onClick={() => handleRemoveUrl(entry.id)} className="icon-btn" style={{ width: 24, height: 24 }}>
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}

          {/* Custom prompt */}
          <div className="form-card">
            <div className="form-card-title">
              <MessageSquare className="w-3.5 h-3.5" />
              Prompt personalizado (opcional)
            </div>
            <Textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              onBlur={async (e) => {
                if (!selectedProfileId) return;
                try {
                  await supabase.from("inspiration_profiles").update({ custom_prompt: e.target.value } as any).eq("id", selectedProfileId);
                } catch {}
              }}
              placeholder="Ex: Analise os posts focando em estrategias de engajamento para o nicho de moda feminina..."
              rows={4}
              className="text-[13px] resize-none"
            />
          </div>

          {/* Start scraping button */}
          <button
            onClick={handleStartScraping}
            disabled={!selectedProfileId || !hasPending || scraping}
            className="btn-cta disabled:opacity-40"
          >
            <span className="flex items-center justify-center gap-2">
              {scraping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {scraping ? "Iniciando scraping..." : "Iniciar Scraping"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
