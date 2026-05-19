import { useState, useEffect } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { AdCompetitor } from "./types";

interface Props {
  competitor: AdCompetitor | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}

export default function EditCompetitorDialog({ competitor, open, onOpenChange, onUpdated }: Props) {
  const [name, setName] = useState("");
  const [pageId, setPageId] = useState("");
  const [pageUrl, setPageUrl] = useState("");
  const [grupo, setGrupo] = useState("");
  const [notas, setNotas] = useState("");
  const [loading, setLoading] = useState(false);
  const [nameError, setNameError] = useState("");

  useEffect(() => {
    if (!competitor || !open) return;
    setName(competitor.name);
    setPageId(competitor.page_id || "");
    setPageUrl(competitor.page_url || "");
    setGrupo(competitor.grupo || "");
    setNotas(competitor.notas || "");
    setNameError("");
  }, [competitor, open]);

  const handleSubmit = async () => {
    if (!competitor) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError("Nome e obrigatorio");
      return;
    }
    setNameError("");
    setLoading(true);

    try {
      const { error } = await supabase
        .from("ad_competitors")
        .update({
          name: trimmedName,
          page_id: pageId.trim() || null,
          page_url: pageUrl.trim() || null,
          grupo: grupo.trim() || null,
          notas: notas.trim() || null,
        })
        .eq("id", competitor.id);

      if (error) throw error;

      toast.success("Concorrente atualizado com sucesso!");
      onOpenChange(false);
      onUpdated();
    } catch (err: any) {
      toast.error(err.message || "Erro ao atualizar concorrente");
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
            Editar Concorrente
          </DialogTitle>
        </DialogHeader>

        <div style={{ display: "flex", flexDirection: "column", gap: 20, padding: "16px 0" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <Label className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>
              Nome <span style={{ color: "var(--cr-red)" }}>*</span>
            </Label>
            <Input
              placeholder="Ex: Concorrente XYZ"
              value={name}
              onChange={(e) => { setName(e.target.value); if (nameError) setNameError(""); }}
              className="h-9 text-[13px]"
              style={inputStyle}
            />
            {nameError && (
              <p style={{ color: "var(--cr-red)", fontSize: 12, marginTop: 2 }}>
                {nameError}
              </p>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <Label className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>
              Page ID (opcional)
            </Label>
            <Input
              placeholder="Ex: 123456789"
              value={pageId}
              onChange={(e) => setPageId(e.target.value)}
              className="h-9 text-[13px]"
              style={inputStyle}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <Label className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>
              Page URL (opcional)
            </Label>
            <Input
              placeholder="Ex: https://facebook.com/pagina"
              value={pageUrl}
              onChange={(e) => setPageUrl(e.target.value)}
              className="h-9 text-[13px]"
              style={inputStyle}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <Label className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>
              Grupo (opcional)
            </Label>
            <Input
              placeholder="Ex: Saude, Ecommerce..."
              value={grupo}
              onChange={(e) => setGrupo(e.target.value)}
              className="h-9 text-[13px]"
              style={inputStyle}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <Label className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>
              Notas (opcional)
            </Label>
            <Textarea
              placeholder="Observacoes sobre este concorrente..."
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={3}
              className="text-[13px] resize-none"
              style={inputStyle}
            />
          </div>
        </div>

        <DialogFooter style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
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
              background: "var(--cr-grad)",
              color: "#fff",
              border: "none",
            }}
          >
            {loading ? "Salvando..." : "Salvar Alteracoes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
