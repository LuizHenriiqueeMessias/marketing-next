import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Plus, X, Camera } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { extractHandle } from "./types";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export default function NewProfileDialog({ open, onOpenChange, onCreated }: Props) {
  const { user } = useAuth();
  const [clientName, setClientName] = useState("");
  const [ownInstagram, setOwnInstagram] = useState("");
  const [maxPosts, setMaxPosts] = useState(10);
  const [targetUrls, setTargetUrls] = useState<string[]>([""]);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
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

  const addTargetRow = () => setTargetUrls((prev) => [...prev, ""]);

  const removeTargetRow = (index: number) => {
    if (targetUrls.length <= 1) return;
    setTargetUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const updateTargetUrl = (index: number, value: string) => {
    setTargetUrls((prev) => prev.map((v, i) => (i === index ? value : v)));
  };

  const resetForm = () => {
    setClientName("");
    setOwnInstagram("");
    setMaxPosts(10);
    setTargetUrls([""]);
    setAvatarUrl(null);
  };

  const handleSubmit = async () => {
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
      const { data: profile, error: profileError } = await supabase
        .from("inspiration_profiles")
        .insert({
          client_name: trimmedName,
          own_instagram: cleanOwnIg,
          instagram_handle: cleanOwnIg,
          max_posts_per_url: maxPosts,
          avatar_url: avatarUrl,
          user_id: user?.id,
        })
        .select("id")
        .single();

      if (profileError) throw profileError;

      const targets = cleanTargets.map((handle) => ({
        profile_id: profile.id,
        instagram_url: handle,
      }));

      const { error: targetsError } = await supabase
        .from("inspiration_targets")
        .insert(targets);

      if (targetsError) throw targetsError;

      toast.success("Perfil criado com sucesso!");
      resetForm();
      onOpenChange(false);
      onCreated();
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar perfil");
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
        className="max-w-lg max-h-[85vh] overflow-y-auto"
        style={{
          background: "var(--dialog-bg)",
          border: "1px solid var(--border)",
        }}
      >
        <DialogHeader>
          <DialogTitle style={{ color: "var(--text-1)" }}>
            Novo Perfil de Inspiracao
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
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
                position: "relative",
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
                Clique para adicionar (max 500KB)
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

          <div className="space-y-2">
            <Label className="text-xs font-medium" style={{ color: "var(--text-2)" }}>Nome</Label>
            <Input
              placeholder="Ex: Uana"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              className="h-9 text-[13px]"
              style={inputStyle}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium" style={{ color: "var(--text-2)" }}>Instagram proprio</Label>
            <Input
              placeholder="@uana_amorim"
              value={ownInstagram}
              onChange={(e) => setOwnInstagram(e.target.value)}
              className="h-9 text-[13px]"
              style={inputStyle}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium" style={{ color: "var(--text-2)" }}>Posts por perfil</Label>
            <Input
              type="number"
              min={1}
              max={50}
              value={maxPosts}
              onChange={(e) => setMaxPosts(Math.min(50, Math.max(1, Number(e.target.value) || 1)))}
              className="w-24 h-9 text-[13px]"
              style={inputStyle}
            />
            <p className="text-[12px]" style={{ color: "var(--text-3)" }}>
              Quantidade de posts a buscar por perfil (1-50)
            </p>
          </div>

          <div className="space-y-3">
            <Label className="text-xs font-medium" style={{ color: "var(--text-2)" }}>Perfis para scrappear</Label>
            {targetUrls.map((url, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  placeholder="https://instagram.com/perfil ou @perfil"
                  value={url}
                  onChange={(e) => updateTargetUrl(index, e.target.value)}
                  className="flex-1 h-9 text-[13px]"
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
        </div>

        <DialogFooter style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 16 }}>
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
            disabled={loading}
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
