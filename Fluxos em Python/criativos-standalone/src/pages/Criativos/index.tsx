import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "@/hooks/use-toast";
import { Upload, X, Send, Image, Video, Loader2, Minus, Plus } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { useToolLogger } from "@/hooks/useToolLogger";

type Marketplace = "mercado-livre" | "shopee" | null;

interface CreativeState {
  fundoBranco: boolean;
  ambientada: boolean;
  ambientadaQty: number;
  utilizacao: boolean;
  utilizacaoQty: number;
  videoProduto: boolean;
  videoUtilizacao: boolean;
}

const initialState: CreativeState = {
  fundoBranco: false,
  ambientada: false,
  ambientadaQty: 1,
  utilizacao: false,
  utilizacaoQty: 1,
  videoProduto: false,
  videoUtilizacao: false,
};

type SimpleKey = "fundoBranco" | "videoProduto" | "videoUtilizacao";
type QtyKey = "ambientada" | "utilizacao";

interface SimpleItem { type: "simple"; key: SimpleKey; label: string; icon: typeof Image }
interface QtyItem { type: "qty"; key: QtyKey; qtyKey: "ambientadaQty" | "utilizacaoQty"; label: string; icon: typeof Image; max: number }
type CreativeItem = SimpleItem | QtyItem;

const FOTO_ITEMS: CreativeItem[] = [
  { type: "simple", key: "fundoBranco", label: "Foto com fundo branco", icon: Image },
  { type: "qty", key: "ambientada", qtyKey: "ambientadaQty", label: "Foto ambientada", icon: Image, max: 2 },
  { type: "qty", key: "utilizacao", qtyKey: "utilizacaoQty", label: "Foto em utilização", icon: Image, max: 2 },
];

const VIDEO_ITEMS: CreativeItem[] = [
  { type: "simple", key: "videoProduto", label: "Video do produto", icon: Video },
  { type: "simple", key: "videoUtilizacao", label: "Video do produto em utilização", icon: Video },
];

export default function Criativos() {
  const { activeBU } = useTheme();
  const { log } = useToolLogger();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [productImage, setProductImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [marketplace, setMarketplace] = useState<Marketplace>(null);
  const [state, setState] = useState<CreativeState>(initialState);
  const [sending, setSending] = useState(false);

  const colors = activeBU?.colors ?? {
    primary: "180 97% 44%",
    secondary: "0 0% 56%",
    accent: "0 0% 11%",
  };

  const primaryColor = `hsl(${colors.primary})`;
  const mutedColor = `hsl(${colors.secondary})`;
  const cardBg = `hsl(${colors.accent})`;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProductImage(file);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setProductImage(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const toggleSimple = (key: SimpleKey) => {
    setState((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleQty = (key: QtyKey, qtyKey: "ambientadaQty" | "utilizacaoQty") => {
    setState((prev) => ({
      ...prev,
      [key]: !prev[key],
      [qtyKey]: prev[key] ? prev[qtyKey] : 1,
    }));
  };

  const adjustQty = (qtyKey: "ambientadaQty" | "utilizacaoQty", delta: number, max: number) => {
    setState((prev) => ({
      ...prev,
      [qtyKey]: Math.min(max, Math.max(1, prev[qtyKey] + delta)),
    }));
  };

  const hasSelection = state.fundoBranco || state.ambientada || state.utilizacao || state.videoProduto || state.videoUtilizacao;
  const canSubmit = productImage && marketplace && hasSelection && !sending;

  const handleSubmit = async () => {
    if (!canSubmit || !productImage) return;
    setSending(true);

    try {
      const selectedCreatives: string[] = [];
      if (state.fundoBranco) selectedCreatives.push("Foto com fundo branco");
      if (state.ambientada) {
        for (let i = 1; i <= state.ambientadaQty; i++) selectedCreatives.push(`Foto ambientada #${i}`);
      }
      if (state.utilizacao) {
        for (let i = 1; i <= state.utilizacaoQty; i++) selectedCreatives.push(`Foto em utilização #${i}`);
      }
      if (state.videoProduto) selectedCreatives.push("Video do produto");
      if (state.videoUtilizacao) selectedCreatives.push("Video do produto em utilização");

      const formData = new FormData();
      formData.append("foto_produto", productImage);
      formData.append("marketplace", marketplace!);
      formData.append("criativos", JSON.stringify(selectedCreatives));

      const res = await fetch(import.meta.env.VITE_N8N_WEBHOOK_CRIATIVOS || "", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error(`Erro ${res.status}`);

      toast({ title: "Solicitação enviada!", description: "Seus criativos estão sendo gerados." });
      log({ toolId: "elevate-ecom-desenvolvedor-de-criativos", actionType: "analysis_start", actionDetail: `Solicitou criativos para ${marketplace}: ${selectedCreatives.join(", ")}`, metadata: { marketplace, criativos: selectedCreatives, totalCriativos: selectedCreatives.length } });
      removeImage();
      setMarketplace(null);
      setState(initialState);
    } catch (err: any) {
      toast({ title: "Erro ao enviar", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const CheckBox = ({ checked }: { checked: boolean }) => (
    <div
      className="w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors"
      style={{
        borderColor: checked ? primaryColor : mutedColor,
        backgroundColor: checked ? primaryColor : "transparent",
      }}
    >
      {checked && (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 6L5 9L10 3" stroke="#0b0b0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );

  const renderItem = (item: CreativeItem) => {
    const isActive = state[item.key];
    const IconComp = item.icon;

    return (
      <div key={item.key}>
        <button
          type="button"
          onClick={() =>
            item.type === "simple"
              ? toggleSimple(item.key)
              : toggleQty(item.key, item.qtyKey)
          }
          className="w-full flex items-center gap-3 rounded-lg px-5 py-4 transition-all border"
          style={{
            backgroundColor: isActive ? `hsl(${colors.primary} / 0.1)` : cardBg,
            borderColor: isActive ? `hsl(${colors.primary} / 0.4)` : "transparent",
          }}
        >
          <CheckBox checked={isActive} />
          <IconComp className="w-4 h-4" style={{ color: isActive ? primaryColor : mutedColor }} />
          <span className="text-sm flex-1 text-left" style={{ color: "#ffffff", fontFamily: "'Inter', sans-serif" }}>
            {item.label}
          </span>
        </button>

        {/* Quantity selector for qty items */}
        <AnimatePresence>
          {item.type === "qty" && isActive && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div
                className="flex items-center gap-3 px-5 py-3 ml-8 mr-0 rounded-b-lg -mt-px"
                style={{ backgroundColor: `hsl(${colors.primary} / 0.05)` }}
              >
                <span className="text-xs" style={{ color: mutedColor, fontFamily: "'Inter', sans-serif" }}>
                  Quantidade:
                </span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); adjustQty(item.qtyKey, -1, item.max); }}
                  className="w-6 h-6 rounded-full flex items-center justify-center transition-colors"
                  style={{
                    backgroundColor: `hsl(${colors.primary} / 0.15)`,
                    color: primaryColor,
                  }}
                >
                  <Minus className="w-3 h-3" />
                </button>
                <span className="text-sm font-semibold w-4 text-center" style={{ color: "#ffffff" }}>
                  {state[item.qtyKey]}
                </span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); adjustQty(item.qtyKey, 1, item.max); }}
                  className="w-6 h-6 rounded-full flex items-center justify-center transition-colors"
                  style={{
                    backgroundColor: `hsl(${colors.primary} / 0.15)`,
                    color: primaryColor,
                  }}
                >
                  <Plus className="w-3 h-3" />
                </button>
                <span className="text-xs" style={{ color: mutedColor }}>
                  (max. {item.max})
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <div className="min-h-screen w-full" style={{ backgroundColor: "#0b0b0b" }}>
      <main className="max-w-2xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <h1
            className="text-2xl font-bold mb-1"
            style={{ color: primaryColor, fontFamily: "'Poppins', sans-serif" }}
          >
            Criativos
          </h1>
          <p className="text-sm" style={{ color: "#ffffff" }}>
            Solicite fotos e videos profissionais para seus produtos
          </p>
        </div>

        {/* Upload Area */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="mb-6"
        >
          <p
            className="text-xs font-semibold tracking-wider mb-3 uppercase"
            style={{ color: "#ffffff", fontFamily: "'Poppins', sans-serif" }}
          >
            Foto do Produto
          </p>

          {!imagePreview ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full rounded-xl border-2 border-dashed p-10 flex flex-col items-center gap-3 transition-colors hover:border-opacity-60"
              style={{
                borderColor: `hsl(${colors.primary} / 0.3)`,
                backgroundColor: `hsl(${colors.primary} / 0.03)`,
              }}
            >
              <Upload className="w-8 h-8" style={{ color: primaryColor }} />
              <span className="text-sm" style={{ color: "#ffffff" }}>
                Clique para anexar a foto do produto
              </span>
              <span className="text-xs" style={{ color: mutedColor }}>
                JPG, PNG ou WEBP
              </span>
            </button>
          ) : (
            <div className="relative rounded-xl overflow-hidden" style={{ backgroundColor: cardBg }}>
              <img src={imagePreview} alt="Preview do produto" className="w-full max-h-64 object-contain p-4" />
              <button
                type="button"
                onClick={removeImage}
                className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center transition-colors"
                style={{ backgroundColor: "rgba(0,0,0,0.6)", color: "#fff" }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileChange} className="hidden" />
        </motion.div>

        {/* Marketplace Selection */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.05 }}
          className="mb-6"
        >
          <p className="text-xs font-semibold tracking-wider mb-3 uppercase" style={{ color: "#ffffff", fontFamily: "'Poppins', sans-serif" }}>
            Marketplace
          </p>
          <div className="grid grid-cols-2 gap-3">
            {([
              { value: "mercado-livre" as Marketplace, label: "Mercado Livre" },
              { value: "shopee" as Marketplace, label: "Shopee" },
            ]).map((mp) => (
              <button
                key={mp.value}
                type="button"
                onClick={() => setMarketplace(mp.value)}
                className="rounded-lg px-5 py-4 text-sm font-medium transition-all border"
                style={{
                  backgroundColor: marketplace === mp.value ? `hsl(${colors.primary} / 0.15)` : cardBg,
                  borderColor: marketplace === mp.value ? `hsl(${colors.primary} / 0.5)` : "transparent",
                  color: marketplace === mp.value ? primaryColor : "#ffffff",
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                {mp.label}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Creative Options */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.1 }}
          className="mb-8"
        >
          <p className="text-xs font-semibold tracking-wider mb-3 uppercase" style={{ color: "#ffffff", fontFamily: "'Poppins', sans-serif" }}>
            Fotos
          </p>
          <div className="space-y-2 mb-5">
            {FOTO_ITEMS.map(renderItem)}
          </div>

          <p className="text-xs font-semibold tracking-wider mb-3 uppercase" style={{ color: "#ffffff", fontFamily: "'Poppins', sans-serif" }}>
            Videos
          </p>
          <div className="space-y-2">
            {VIDEO_ITEMS.map(renderItem)}
          </div>
        </motion.div>

        {/* Submit */}
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.15 }}>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full flex items-center justify-center gap-2 rounded-xl py-4 text-sm font-semibold transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ backgroundColor: primaryColor, color: "#0b0b0b", fontFamily: "'Poppins', sans-serif" }}
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sending ? "Enviando..." : "Enviar Solicitação"}
          </button>
        </motion.div>
      </main>
    </div>
  );
}
