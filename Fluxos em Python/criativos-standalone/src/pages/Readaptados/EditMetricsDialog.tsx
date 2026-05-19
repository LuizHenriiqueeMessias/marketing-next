import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Minus, Plus } from "lucide-react";

import type { Tables } from "@/integrations/supabase/types";

export type ReadaptedPost = Tables<"readapted_posts"> & {
  inspiration_analysis?: {
    tema?: string;
    gancho?: string;
    sugestao_readaptacao?: string;
    score_relevancia?: number;
    [key: string]: unknown;
  } | null;
  inspiration_post_url?: string | null;
};

interface Props {
  post: ReadaptedPost | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (id: string, data: {
    curtidas: number;
    envios: number;
    visualizacoes: number;
  }) => void;
}

export default function EditMetricsDialog({ post, open, onOpenChange, onSave }: Props) {
  const [curtidas, setCurtidas] = useState(String(post?.curtidas ?? 0));
  const [envios, setEnvios] = useState(String(post?.envios ?? 0));
  const [visualizacoes, setVisualizacoes] = useState(String(post?.visualizacoes ?? 0));

  useEffect(() => {
    if (post) {
      setCurtidas(String(post.curtidas));
      setEnvios(String(post.envios));
      setVisualizacoes(String(post.visualizacoes));
    }
  }, [post]);

  const handleSave = () => {
    if (!post) return;
    onSave(post.id, {
      curtidas: parseInt(curtidas) || 0,
      envios: parseInt(envios) || 0,
      visualizacoes: parseInt(visualizacoes) || 0,
    });
  };

  const f = "var(--cr-font)";
  const inputStyle = {
    background: "var(--cr-surface)",
    border: "1px solid var(--cr-border)",
    color: "var(--cr-text-1)",
    fontFamily: f,
    borderRadius: "var(--cr-radius)",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md max-h-[85vh] overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-thumb]:rounded-full"
        style={{
          background: "var(--cr-dialog-bg)",
          border: "1px solid var(--cr-border)",
          fontFamily: f,
          scrollbarWidth: "thin",
          scrollbarColor: "rgba(255,255,255,0.15) transparent",
        }}
      >
        <DialogHeader>
          <DialogTitle style={{ color: "var(--cr-text-1)", fontFamily: f }}>
            Editar Metricas
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label className="text-xs font-medium" style={{ color: "var(--cr-text-2)" }}>Curtidas</Label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurtidas((v) => String(Math.max(0, (parseInt(v, 10) || 0) - 1)))}
                  disabled={parseInt(curtidas, 10) <= 0 || isNaN(parseInt(curtidas, 10))}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${parseInt(curtidas, 10) <= 0 || isNaN(parseInt(curtidas, 10)) ? "opacity-40 cursor-not-allowed" : ""}`}
                  style={{
                    background: "var(--cr-surface)",
                    border: "1px solid var(--cr-border)",
                    color: "var(--cr-text-2)",
                  }}
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={curtidas}
                  onChange={(e) => setCurtidas(e.target.value)}
                  className="w-16 h-9 text-center text-[13px]"
                  style={inputStyle}
                />
                <button
                  type="button"
                  onClick={() => setCurtidas((v) => String((parseInt(v, 10) || 0) + 1))}
                  className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                  style={{
                    background: "var(--cr-surface)",
                    border: "1px solid var(--cr-border)",
                    color: "var(--cr-text-2)",
                  }}
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium" style={{ color: "var(--cr-text-2)" }}>Envios</Label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEnvios((v) => String(Math.max(0, (parseInt(v, 10) || 0) - 1)))}
                  disabled={parseInt(envios, 10) <= 0 || isNaN(parseInt(envios, 10))}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${parseInt(envios, 10) <= 0 || isNaN(parseInt(envios, 10)) ? "opacity-40 cursor-not-allowed" : ""}`}
                  style={{
                    background: "var(--cr-surface)",
                    border: "1px solid var(--cr-border)",
                    color: "var(--cr-text-2)",
                  }}
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={envios}
                  onChange={(e) => setEnvios(e.target.value)}
                  className="w-16 h-9 text-center text-[13px]"
                  style={inputStyle}
                />
                <button
                  type="button"
                  onClick={() => setEnvios((v) => String((parseInt(v, 10) || 0) + 1))}
                  className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                  style={{
                    background: "var(--cr-surface)",
                    border: "1px solid var(--cr-border)",
                    color: "var(--cr-text-2)",
                  }}
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium" style={{ color: "var(--cr-text-2)" }}>Visualizacoes</Label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setVisualizacoes((v) => String(Math.max(0, (parseInt(v, 10) || 0) - 1)))}
                  disabled={parseInt(visualizacoes, 10) <= 0 || isNaN(parseInt(visualizacoes, 10))}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${parseInt(visualizacoes, 10) <= 0 || isNaN(parseInt(visualizacoes, 10)) ? "opacity-40 cursor-not-allowed" : ""}`}
                  style={{
                    background: "var(--cr-surface)",
                    border: "1px solid var(--cr-border)",
                    color: "var(--cr-text-2)",
                  }}
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={visualizacoes}
                  onChange={(e) => setVisualizacoes(e.target.value)}
                  className="w-16 h-9 text-center text-[13px]"
                  style={inputStyle}
                />
                <button
                  type="button"
                  onClick={() => setVisualizacoes((v) => String((parseInt(v, 10) || 0) + 1))}
                  className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                  style={{
                    background: "var(--cr-surface)",
                    border: "1px solid var(--cr-border)",
                    color: "var(--cr-text-2)",
                  }}
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-[13px]"
            style={{ color: "var(--cr-text-3)", fontFamily: f }}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            className="text-[13px]"
            style={{ background: "var(--cr-accent)", color: "#fff", fontFamily: f }}
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
