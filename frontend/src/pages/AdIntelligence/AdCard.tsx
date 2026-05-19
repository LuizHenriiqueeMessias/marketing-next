import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Video, Image, LayoutGrid } from "lucide-react";
import type { AdCreativeWithRelations } from "./types";

function ScoreBar({ score }: { score: number | null }) {
  if (score == null) return <span style={{ color: "var(--text-3)", fontSize: 12 }}>--</span>;
  const level = score >= 8 ? "high" : score >= 6 ? "mid" : "low";
  const filled = Math.round(score / 2);
  return (
    <div className="score-bar">
      <div className="score-dots">
        {[0,1,2,3,4].map(i => <div key={i} className={`score-dot ${i < filled ? `filled-${level}` : "empty"}`} />)}
      </div>
      <span className={`score-num ${level}`}>{score}</span>
    </div>
  );
}

function getMediaBadgeInfo(type: string | null): { className: string; icon: typeof Video; label: string } {
  const t = (type || "").toLowerCase();
  if (t === "video") {
    return { className: "badge badge-video", icon: Video, label: "Video" };
  }
  if (t === "carousel") {
    return { className: "badge badge-carousel", icon: LayoutGrid, label: "Carrossel" };
  }
  return { className: "badge badge-image", icon: Image, label: "Imagem" };
}

export function hasUnresolvedPlaceholder(text: string | null | undefined): boolean {
  return !!text && /\{\{[^}]+\}\}/.test(text);
}

interface AdCardProps {
  ad: AdCreativeWithRelations;
}

export default function AdCard({ ad }: AdCardProps) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const mediaBadge = getMediaBadgeInfo(ad.creative_type);
  const BadgeIcon = mediaBadge.icon;

  const thumbnailContent = () => {
    const imgSrc = ad.storage_image_path
      ? `${supabaseUrl}/storage/v1/object/public/ad-media/${ad.storage_image_path}`
      : ad.thumbnail_url;
    if (imgSrc) {
      return (
        <img
          src={imgSrc}
          alt="Ad thumbnail"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            borderRadius: "var(--radius-sm)",
          }}
        />
      );
    }
    if (ad.storage_video_path && ad.creative_type === "video") {
      return (
        <div
          style={{
            width: "100%",
            height: "100%",
            background: "var(--surface)",
            borderRadius: "var(--radius-sm)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Video size={24} style={{ color: "var(--text-3)" }} />
        </div>
      );
    }
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "var(--surface)",
          borderRadius: "var(--radius-sm)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Image size={24} style={{ color: "var(--text-3)" }} />
      </div>
    );
  };

  const startDateFormatted = ad.start_date
    ? new Date(ad.start_date).toLocaleDateString()
    : "—";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <Link
        to={`/ad-intelligence/ad/${ad.id}`}
        style={{ textDecoration: "none", display: "block" }}
      >
        <div
          className="card"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            padding: 16,
            cursor: "pointer",
            transition: "border-color 0.2s, transform 0.15s",
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border-hover)";
            (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)";
            (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
          }}
        >
          {/* Thumbnail */}
          <div style={{ height: 160, overflow: "hidden", borderRadius: "var(--radius-sm)" }}>
            {thumbnailContent()}
          </div>

          {/* Card body */}
          <div style={{ marginTop: 16 }}>
            {/* Badges row */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <span className={mediaBadge.className} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <BadgeIcon size={12} />
                {mediaBadge.label}
              </span>
              <span
                className={`badge ${ad.status === "ativo" ? "badge-status-done" : "badge-status-pending"}`}
              >
                {ad.status === "ativo" ? "Ativo" : "Inativo"}
              </span>
              <div style={{ marginLeft: "auto" }}>
                <ScoreBar score={ad.ad_analyses?.score ?? null} />
              </div>
            </div>

            {/* Competitor name */}
            <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 4 }}>
              {ad.ad_competitors.name}
            </div>

            {/* Body text snippet - 2-line clamp via -webkit-line-clamp */}
            {hasUnresolvedPlaceholder(ad.body_text) ? (
              <div style={{ marginBottom: 8 }}>
                <span
                  className="badge"
                  style={{
                    background: "var(--warn-bg, #3a2e14)",
                    color: "var(--warn, #e8b339)",
                    border: "1px solid var(--warn, #e8b339)",
                    fontSize: 11,
                  }}
                  title="Anuncio de catalogo dinamico (placeholders {{...}} nao resolvidos pelo Facebook)"
                >
                  Template dinamico
                </span>
              </div>
            ) : (
              <div
                style={{
                  fontSize: 13,
                  color: "var(--text-2)",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                  marginBottom: 8,
                  lineHeight: 1.5,
                }}
              >
                {ad.body_text ?? "—"}
              </div>
            )}

            {/* Start date */}
            <div style={{ fontSize: 12, color: "var(--text-3)" }}>
              {startDateFormatted}
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
