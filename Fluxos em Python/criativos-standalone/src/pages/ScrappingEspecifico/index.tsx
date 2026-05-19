import { useState, useEffect } from "react";
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

interface Profile {
  id: string;
  client_name: string;
  own_instagram: string;
  custom_prompt: string | null;
}

interface UrlEntry {
  id: string;
  url: string;
  status: "pendente" | "processando" | "concluido";
}

const f = "var(--cr-font)";

export default function ScrappingEspecifico() {
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

  // Load saved prompt when profile changes
  useEffect(() => {
    const profile = profiles.find((p) => p.id === selectedProfileId);
    setCustomPrompt(profile?.custom_prompt || "");
  }, [selectedProfileId, profiles]);

  const fetchProfiles = async () => {
    setLoadingProfiles(true);
    try {
      const { data, error } = await supabase
        .from("inspiration_profiles")
        .select("id, client_name, own_instagram, custom_prompt")
        .order("client_name", { ascending: true });
      if (error) throw error;
      setProfiles(data || []);
    } catch (err: any) {
      toast.error(err.message || "Erro ao buscar perfis");
    } finally {
      setLoadingProfiles(false);
    }
  };

  const handleAddUrls = () => {
    const lines = urlText
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) {
      toast.error("Insira pelo menos uma URL");
      return;
    }

    const invalid = lines.filter((l) => !l.includes("instagram.com"));
    if (invalid.length > 0) {
      toast.error(`${invalid.length} URL(s) invalida(s) - devem conter instagram.com`);
      return;
    }

    // Deduplicate against existing
    const existingUrls = new Set(urls.map((u) => u.url));
    const newEntries: UrlEntry[] = lines
      .filter((l) => !existingUrls.has(l))
      .map((url) => ({
        id: crypto.randomUUID(),
        url,
        status: "pendente" as const,
      }));

    if (newEntries.length === 0) {
      toast.info("Todas as URLs ja foram adicionadas");
      return;
    }

    setUrls((prev) => [...prev, ...newEntries]);
    setUrlText("");
    toast.success(`${newEntries.length} URL(s) adicionada(s)`);
  };

  const handleRemoveUrl = (id: string) => {
    setUrls((prev) => prev.filter((u) => u.id !== id));
  };

  const handleStartScraping = async () => {
    const profile = profiles.find((p) => p.id === selectedProfileId);
    if (!profile) {
      toast.error("Selecione um perfil");
      return;
    }

    const pendingUrls = urls.filter((u) => u.status === "pendente").map((u) => u.url);
    if (pendingUrls.length === 0) {
      toast.error("Nenhuma URL pendente para scrappear");
      return;
    }

    setScraping(true);
    setUrls((prev) =>
      prev.map((u) =>
        u.status === "pendente" ? { ...u, status: "processando" as const } : u
      )
    );

    try {
      const { data, error } = await supabase.functions.invoke("apify-proxy", {
        body: {
          directUrls: pendingUrls,
          resultsType: "posts",
          resultsLimit: pendingUrls.length,
          profile_id: profile.id,
          webhookPayload: {
            profile_id: profile.id,
            client_name: profile.client_name,
            own_instagram: profile.own_instagram,
            source: "specific",
            ...(customPrompt.trim() ? { custom_prompt: customPrompt.trim() } : {}),
          },
        },
      });

      if (error) throw new Error(error.message);

      toast.success(`Scraping iniciado: ${pendingUrls.length} URL(s)`);
    } catch (err: any) {
      toast.error(err.message || "Erro ao iniciar scraping");
      setUrls((prev) =>
        prev.map((u) =>
          u.status === "processando" ? { ...u, status: "pendente" as const } : u
        )
      );
    } finally {
      setScraping(false);
    }
  };

  const selectedProfile = profiles.find((p) => p.id === selectedProfileId);
  const hasPending = urls.some((u) => u.status === "pendente");

  return (
    <div
      className="flex flex-col h-full overflow-y-auto relative"
      style={{ fontFamily: f, background: "var(--cr-bg)" }}
    >
      {/* Animated gradient orbs background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden z-0">
        <div
          className="absolute w-[500px] h-[500px] rounded-full opacity-[0.04] blur-[120px] animate-pulse"
          style={{
            background: "var(--cr-grad)",
            top: "-10%",
            right: "-5%",
            animationDuration: "8s",
          }}
        />
        <div
          className="absolute w-[400px] h-[400px] rounded-full opacity-[0.03] blur-[100px] animate-pulse"
          style={{
            background: "var(--cr-accent)",
            bottom: "5%",
            left: "-5%",
            animationDuration: "12s",
          }}
        />
      </div>

      <div className="relative z-10 p-6 md:p-8 max-w-3xl mx-auto w-full space-y-6">
        {/* Header */}
        <div>
          <h1
            className="text-xl font-bold tracking-tight"
            style={{ color: "var(--cr-text-1)" }}
          >
            Scrapping Especifico
          </h1>
          <p className="text-[13px] mt-1" style={{ color: "var(--cr-text-2)" }}>
            Scrappear posts especificos do Instagram por URL
          </p>
        </div>

        {/* Profile selector */}
        <div
          className="rounded-xl p-5 space-y-3"
          style={{
            background: "var(--cr-surface)",
            border: "1px solid var(--cr-border)",
            borderRadius: "var(--cr-radius)",
          }}
        >
          <label
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--cr-text-3)" }}
          >
            Perfil
          </label>
          <Select value={selectedProfileId} onValueChange={setSelectedProfileId}>
            <SelectTrigger
              className="h-10 text-[13px]"
              style={{
                background: "var(--cr-bg)",
                border: "1px solid var(--cr-border)",
                color: "var(--cr-text-1)",
                borderRadius: "var(--cr-radius-sm)",
              }}
            >
              <SelectValue placeholder={loadingProfiles ? "Carregando..." : "Selecione um perfil"} />
            </SelectTrigger>
            <SelectContent
              style={{
                background: "var(--cr-dialog-bg)",
                border: "1px solid var(--cr-border)",
              }}
            >
              {profiles.map((p) => (
                <SelectItem key={p.id} value={p.id} className="text-[13px]">
                  {p.client_name} — @{p.own_instagram}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* URL input */}
        <div
          className="rounded-xl p-5 space-y-3"
          style={{
            background: "var(--cr-surface)",
            border: "1px solid var(--cr-border)",
            borderRadius: "var(--cr-radius)",
          }}
        >
          <label
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--cr-text-3)" }}
          >
            URLs do Instagram (uma por linha)
          </label>
          <Textarea
            value={urlText}
            onChange={(e) => setUrlText(e.target.value)}
            placeholder={"https://www.instagram.com/p/...\nhttps://www.instagram.com/reel/..."}
            rows={5}
            className="text-[13px] resize-none"
            style={{
              background: "var(--cr-bg)",
              border: "1px solid var(--cr-border)",
              color: "var(--cr-text-1)",
              borderRadius: "var(--cr-radius-sm)",
            }}
          />
          <Button
            onClick={handleAddUrls}
            disabled={!urlText.trim()}
            className="gap-1.5 h-9 text-[12px] font-semibold border-none"
            style={{
              background: "var(--cr-surface)",
              border: "1px solid var(--cr-border)",
              color: "var(--cr-text-1)",
              borderRadius: "var(--cr-radius-sm)",
            }}
          >
            <Link className="w-3.5 h-3.5" /> Adicionar URLs
          </Button>
        </div>

        {/* URL list */}
        {urls.length > 0 && (
          <div
            className="rounded-xl overflow-hidden"
            style={{
              background: "var(--cr-surface)",
              border: "1px solid var(--cr-border)",
              borderRadius: "var(--cr-radius)",
            }}
          >
            <div className="p-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--cr-border)" }}>
              <span
                className="text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--cr-text-3)" }}
              >
                URLs adicionadas ({urls.length})
              </span>
            </div>
            <AnimatePresence>
              {urls.map((entry) => (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-3 px-4 py-3"
                  style={{ borderBottom: "1px solid var(--cr-border)" }}
                >
                  {/* Status badge */}
                  {entry.status === "pendente" && (
                    <span
                      className="flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full font-medium"
                      style={{ background: "var(--cr-surface)", color: "var(--cr-text-3)", border: "1px solid var(--cr-border)" }}
                    >
                      pendente
                    </span>
                  )}
                  {entry.status === "processando" && (
                    <span
                      className="flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full font-medium animate-pulse"
                      style={{ background: "rgba(0,200,200,0.1)", color: "var(--cr-cyan)", border: "1px solid rgba(0,200,200,0.2)" }}
                    >
                      processando
                    </span>
                  )}
                  {entry.status === "concluido" && (
                    <span
                      className="flex-shrink-0 flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium"
                      style={{ background: "rgba(232,96,74,0.1)", color: "var(--cr-accent)", border: "1px solid rgba(232,96,74,0.2)" }}
                    >
                      <CheckCircle className="w-3 h-3" /> concluido
                    </span>
                  )}

                  {/* URL */}
                  <span
                    className="text-[12px] truncate min-w-0 flex-1"
                    style={{ color: "var(--cr-text-2)" }}
                    title={entry.url}
                  >
                    {entry.url}
                  </span>

                  {/* Remove */}
                  {entry.status === "pendente" && (
                    <button
                      onClick={() => handleRemoveUrl(entry.id)}
                      className="flex-shrink-0 p-1 rounded-md transition-colors hover:bg-white/5"
                      style={{ color: "var(--cr-text-3)" }}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Custom prompt */}
        <div
          className="rounded-xl p-5 space-y-3"
          style={{
            background: "var(--cr-surface)",
            border: "1px solid var(--cr-border)",
            borderRadius: "var(--cr-radius)",
          }}
        >
          <div className="flex items-center gap-2">
            <MessageSquare className="w-3.5 h-3.5" style={{ color: "var(--cr-text-3)" }} />
            <label
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--cr-text-3)" }}
            >
              Prompt personalizado (opcional)
            </label>
          </div>
          <Textarea
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            onBlur={async (e) => {
              if (!selectedProfileId) return;
              try {
                await supabase
                  .from("inspiration_profiles")
                  .update({ custom_prompt: e.target.value } as any)
                  .eq("id", selectedProfileId);
              } catch {}
            }}
            placeholder="Ex: Analise os posts focando em estrategias de engajamento para o nicho de moda feminina..."
            rows={4}
            className="text-[13px] resize-none"
            style={{
              background: "var(--cr-bg)",
              border: "1px solid var(--cr-border)",
              color: "var(--cr-text-1)",
              borderRadius: "var(--cr-radius-sm)",
            }}
          />
          <p className="text-[11px]" style={{ color: "var(--cr-text-3)" }}>
            Salvo automaticamente no perfil. Sera enviado ao N8N para personalizar a analise.
          </p>
        </div>

        {/* Start scraping button */}
        <Button
          onClick={handleStartScraping}
          disabled={!selectedProfileId || !hasPending || scraping}
          className="w-full gap-2 h-11 text-[13px] font-semibold border-none disabled:opacity-40"
          style={{
            background: "var(--cr-grad)",
            color: "#fff",
            fontFamily: f,
            borderRadius: "var(--cr-radius)",
            boxShadow: "0 0 24px rgba(194,57,110, 0.30)",
          }}
        >
          {scraping ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          {scraping ? "Iniciando scraping..." : "Iniciar Scraping"}
        </Button>
      </div>
    </div>
  );
}
