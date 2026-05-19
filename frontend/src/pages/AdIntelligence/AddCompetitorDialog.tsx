import { useState } from "react";
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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export default function AddCompetitorDialog({ open, onOpenChange, onCreated }: Props) {
  const [name, setName] = useState("");
  const [pageInput, setPageInput] = useState("");
  const [grupo, setGrupo] = useState("");
  const [notas, setNotas] = useState("");
  const [loading, setLoading] = useState(false);
  const [nameError, setNameError] = useState("");

  const resetForm = () => {
    setName("");
    setPageInput("");
    setGrupo("");
    setNotas("");
    setNameError("");
  };

  /** Extrai page_id de URL da Ad Library ou retorna o input direto como ID */
  const extractPageId = (input: string): { pageId: string; pageUrl: string } => {
    const trimmed = input.trim();
    // Tenta extrair view_all_page_id da URL
    const match = trimmed.match(/view_all_page_id=(\d+)/);
    if (match) {
      return { pageId: match[1], pageUrl: trimmed };
    }
    // Tenta extrair page_id= da URL
    const match2 = trimmed.match(/page_id=(\d+)/);
    if (match2) {
      return { pageId: match2[1], pageUrl: trimmed };
    }
    // Se é só número, é o ID direto
    if (/^\d+$/.test(trimmed)) {
      return { pageId: trimmed, pageUrl: "" };
    }
    // Se é uma URL mas sem page_id, salva como URL
    if (trimmed.startsWith("http")) {
      return { pageId: "", pageUrl: trimmed };
    }
    return { pageId: trimmed, pageUrl: "" };
  };

  const handleSubmit = async () => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      setNameError("Nome e obrigatorio");
      return;
    }
    setNameError("");
    setLoading(true);

    try {
      const { pageId, pageUrl } = extractPageId(pageInput);
      const { error } = await supabase.from("ad_competitors").insert({
        name: trimmedName,
        page_id: pageId || null,
        page_url: pageUrl || null,
        grupo: grupo.trim() || null,
        notas: notas.trim() || null,
      });

      if (error) throw error;

      toast.success("Concorrente adicionado com sucesso!");
      resetForm();
      onOpenChange(false);
      onCreated();
    } catch (err: any) {
      toast.error(err.message || "Erro ao adicionar concorrente");
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
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetForm(); onOpenChange(o); }}>
      <DialogContent
        className="max-w-lg max-h-[85vh] overflow-y-auto"
        style={{
          background: "var(--dialog-bg)",
          border: "1px solid var(--border)",
        }}
      >
        <DialogHeader>
          <DialogTitle style={{ color: "var(--text-1)" }}>
            Adicionar Concorrente
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
              Link da Ad Library ou Page ID
            </Label>
            <Input
              placeholder="Cole a URL da Ad Library ou o Page ID (ex: 100422711491905)"
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              className="h-9 text-[13px]"
              style={inputStyle}
            />
            <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
              Aceita URL completa (extrai o ID automaticamente) ou o numero do Page ID direto
            </p>
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
            onClick={() => { resetForm(); onOpenChange(false); }}
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
            {loading ? "Adicionando..." : "Adicionar Concorrente"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
