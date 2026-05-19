import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Minus, Plus, X, Loader2, MessageSquare, Camera } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { extractHandle } from "./types";
import type { InspirationProfile, InspirationTarget } from "./types";

interface Props {
  profile: InspirationProfile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export default function EditProfileDialog({ profile, open, onOpenChange, onSaved }: Props) {
  const [clientName, setClientName] = useState("");
  const [ownInstagram, setOwnInstagram] = useState("");
  const [maxPosts, setMaxPosts] = useState(10);
  const [targetUrls, setTargetUrls] = useState<string[]>([""]);
  const [customPrompt, setCustomPrompt] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingTargets, setLoadingTargets] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500_000) {
      toast.error("Imagem muito grande (max 500KB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAvatarUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (!profile || !open) return;

    setClientName(profile.client_name);
    setOwnInstagram(profile.own_instagram);
    setMaxPosts(profile.max_posts_per_url ?? 10);
    setCustomPrompt(profile.custom_prompt || "");
    setAvatarUrl(profile.avatar_url || null);

    setLoadingTargets(true);
    supabase
      .from("inspiration_targets")
      .select("instagram_url")
      .eq("profile_id", profile.id)
      .then(({ data, error }: any) => {
        if (error) {
          toast.error("Erro ao carregar alvos");
        } else if (data && data.length > 0) {
          setTargetUrls(data.map((t: any) => t.instagram_url));
        } else {
          setTargetUrls([""]);
        }
        setLoadingTargets(false);
      });
  }, [profile, open]);

  const addTargetRow = () => setTargetUrls((prev) => [...prev, ""]);

  const removeTargetRow = (index: number) => {
    if (targetUrls.length <= 1) return;
    setTargetUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const updateTargetUrl = (index: number, value: string) => {
    setTargetUrls((prev) => prev.map((v, i) => (i === index ? value : v)));
  };

  const handleSubmit = async () => {
    if (!profile) return;

    const trimmedName = clientName.trim();
    const cleanOwnIg = extractHandle(ownInstagram);
    const cleanTargets = targetUrls
      .map((u) => extractHandle(u))
      .filter((u) => u.length > 0);

    if (!trimmedName || !cleanOwnIg) {
      toast.error("Preencha o nome e o Instagram proprio");
      return;
    }
    if (cleanTargets.length === 0) {
      toast.error("Adicione ao menos um perfil para scrappear");
      return;
    }

    setLoading(true);
    try {
      const { error: profileError } = await supabase
        .from("inspiration_profiles")
        .update({
          client_name: trimmedName,
          own_instagram: cleanOwnIg,
          instagram_handle: cleanOwnIg,
          max_posts_per_url: maxPosts,
          custom_prompt: customPrompt.trim() || null,
          avatar_url: avatarUrl,
        })
        .eq("id", profile.id);

      if (profileError) throw profileError;

      const { error: deleteError } = await supabase
        .from("inspiration_targets")
        .delete()
        .eq("profile_id", profile.id);

      if (deleteError) throw deleteError;

      const targets = cleanTargets.map((handle) => ({
        profile_id: profile.id,
        instagram_url: handle,
      }));

      const { error: targetsError } = await supabase
        .from("inspiration_targets")
        .insert(targets);

      if (targetsError) throw targetsError;

      toast.success("Perfil atualizado com sucesso!");
      onOpenChange(false);
      onSaved();
    } catch (err: any) {
      toast.error(err.message || "Erro ao atualizar perfil");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    color: "var(--text-1)",
    borderRadius: "var(--radius)",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg max-h-[85vh] overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-thumb]:rounded-full"
        style={{
          background: "var(--dialog-bg)",
          border: "1px solid var(--border)",
          scrollbarWidth: "thin",
          scrollbarColor: "rgba(255,255,255,0.15) transparent",
        }}
      >
        <DialogHeader>
          <DialogTitle style={{ color: "var(--text-1)" }}>
            Editar Perfil
          </DialogTitle>
        </DialogHeader>

        {loadingTargets ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--text-3)" }} />
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 24, padding: "20px 0" }}>
            {/* Avatar upload */}
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  width: 56, height: 56, borderRadius: 14,
                  background: avatarUrl ? "none" : "var(--surface)",
                  border: "1.5px dashed var(--border)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", overflow: "hidden", flexShrink: 0,
                }}
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <Camera size={18} style={{ color: "var(--text-3)" }} />
                )}
              </button>
              <div>
                <p className="text-[13px] font-medium" style={{ color: "var(--text-1)" }}>Foto do perfil</p>
                <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
                  Clique para alterar (max 500KB)
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                style={{ display: "none" }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Label className="text-xs font-medium" style={{ color: "var(--text-2)" }}>Nome</Label>
              <Input
                placeholder="Ex: Uana"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="h-10 text-[13px]"
                style={inputStyle}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Label className="text-xs font-medium" style={{ color: "var(--text-2)" }}>Instagram proprio</Label>
              <Input
                placeholder="@uana_amorim"
                value={ownInstagram}
                onChange={(e) => setOwnInstagram(e.target.value)}
                className="h-10 text-[13px]"
                style={inputStyle}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Label className="text-xs font-medium" style={{ color: "var(--text-2)" }}>Posts por perfil</Label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMaxPosts((v) => Math.max(1, v - 1))}
                  disabled={maxPosts <= 1}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${maxPosts <= 1 ? "opacity-40 cursor-not-allowed" : ""}`}
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    color: "var(--text-2)",
                  }}
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={maxPosts}
                  onChange={(e) => {
                    const parsed = parseInt(e.target.value, 10);
                    if (!isNaN(parsed)) {
                      setMaxPosts(Math.min(50, Math.max(1, parsed)));
                    }
                  }}
                  className="w-16 h-9 text-center text-[13px]"
                  style={inputStyle}
                />
                <button
                  type="button"
                  onClick={() => setMaxPosts((v) => Math.min(50, v + 1))}
                  disabled={maxPosts >= 50}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${maxPosts >= 50 ? "opacity-40 cursor-not-allowed" : ""}`}
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    color: "var(--text-2)",
                  }}
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-[12px]" style={{ color: "var(--text-3)" }}>
                Quantidade de posts a buscar por perfil (1-50)
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Label className="text-xs font-medium" style={{ color: "var(--text-2)" }}>Perfis para scrappear</Label>
              {targetUrls.map((url, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    placeholder="https://instagram.com/perfil ou @perfil"
                    value={url}
                    onChange={(e) => updateTargetUrl(index, e.target.value)}
                    className="flex-1 h-10 text-[13px]"
                    style={inputStyle}
                  />
                  {targetUrls.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeTargetRow(index)}
                      className="p-2 rounded-lg transition-colors"
                      style={{ color: "var(--text-3)" }}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addTargetRow}
                className="gap-1.5 text-xs"
                style={{
                  border: "1px solid var(--border)",
                  color: "var(--text-2)",
                  background: "transparent",
                }}
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar perfil
              </Button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Label className="text-xs font-medium flex items-center gap-1.5" style={{ color: "var(--text-2)" }}>
                <MessageSquare className="w-3.5 h-3.5" />
                Prompt personalizado (opcional)
              </Label>
              <Textarea
                placeholder="Ex: Analise os posts focando em estrategias de engajamento para o nicho de moda feminina..."
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                rows={4}
                className="text-[13px] resize-none"
                style={inputStyle}
              />
              <p className="text-[12px]" style={{ color: "var(--text-3)" }}>
                Este prompt sera usado como instrucao adicional ao processar os posts deste perfil
              </p>
            </div>

          </div>
        )}

        <DialogFooter style={{ display: "flex", justifyContent: "flex-end", gap: 12, paddingTop: 20, borderTop: "1px solid var(--border)", marginTop: 8 }}>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="text-[13px]"
            style={{
              border: "1px solid var(--border)",
              color: "var(--text-2)",
              background: "transparent",
            }}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || loadingTargets}
            className="text-[13px]"
            style={{
              background: "var(--accent)",
              color: "#fff",
            }}
          >
            {loading ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
