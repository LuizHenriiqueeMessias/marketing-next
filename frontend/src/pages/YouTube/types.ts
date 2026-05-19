export interface YouTubeChannel {
  id: string;
  user_id: string | null;
  name: string;
  handle: string | null;
  url: string;
  channel_id: string | null;
  avatar: string | null;
  bio: string | null;
  subscribers: number | null;
  total_views: number | null;
  video_count: number | null;
  max_videos: number;
  custom_prompt: string | null;
  last_scraped_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface YouTubePost {
  id: string;
  channel_id: string | null;
  user_id: string | null;
  post_url: string | null;
  video_id: string | null;
  title: string | null;
  description: string | null;
  media_type: string | null;
  thumbnail_url: string | null;
  views: number;
  likes: number;
  comments: number;
  duration: number | null;
  published_at: string | null;
  is_short: boolean;
  tags: string[] | null;
  transcricao: string | null;
  transcricao_formatada: string | null;
  cortes_sugeridos: unknown;
  analysis: Record<string, unknown> | null;
  readapted: boolean;
  discarded: boolean;
  raw_apify_data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface YouTubeReadapted {
  id: string;
  youtube_post_id: string;
  channel_id: string | null;
  user_id: string | null;
  client_name: string | null;
  original_title: string | null;
  original_description: string | null;
  original_post_url: string | null;
  original_thumbnail_url: string | null;
  media_type: string | null;
  tema: string | null;
  gancho: string | null;
  sugestao_readaptacao: string | null;
  hooks_magneticos: Record<string, string[]> | null;
  score_relevancia: number | null;
  transcricao: string | null;
  visualizacoes: number;
  curtidas: number;
  comentarios: number;
  created_at: string;
  updated_at: string;
  youtube_posts?: YouTubePost | null;
}

export function normalizeYouTubeUrl(input: string): string {
  const cleaned = input.trim();
  if (!cleaned) return "";
  if (/^https?:\/\//i.test(cleaned)) return cleaned;
  if (/^(www\.)?(youtube\.com|youtu\.be)/i.test(cleaned)) {
    return `https://${cleaned.replace(/^www\./i, "")}`;
  }
  if (cleaned.startsWith("@")) return `https://www.youtube.com/${cleaned}`;
  return `https://www.youtube.com/@${cleaned.replace(/^@/, "")}`;
}

export function formatCompactNumber(value: number | null): string {
  if (value == null) return "--";
  return new Intl.NumberFormat("pt-BR", {
    notation: "compact",
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value);
}

export function formatDate(value: string | null): string {
  if (!value) return "--";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return "--";
  return parsed.toLocaleDateString("pt-BR");
}

export function isYouTubeSchemaMissingError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { code?: string; message?: string };
  return (
    maybeError.code === "PGRST205" ||
    maybeError.message?.includes("youtube_channels") === true ||
    maybeError.message?.includes("youtube_posts") === true
  );
}
