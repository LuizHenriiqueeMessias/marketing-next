export interface TikTokProfile {
  id: string;
  user_id: string | null;
  name: string;
  handle: string | null;
  url: string;
  platform_id: string | null;
  avatar: string | null;
  bio: string | null;
  followers: number | null;
  following: number | null;
  likes_total: number | null;
  video_count: number | null;
  max_videos: number;
  custom_prompt: string | null;
  last_scraped_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TikTokPost {
  id: string;
  profile_id: string | null;
  user_id: string | null;
  post_url: string | null;
  video_id: string | null;
  caption: string | null;
  media_type: string | null;
  thumbnail_url: string | null;
  likes: number;
  comments: number;
  shares: number;
  views: number;
  plays: number;
  bookmarks: number;
  duration: number | null;
  music_name: string | null;
  music_author: string | null;
  hashtags: string[] | null;
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

export interface TikTokReadapted {
  id: string;
  tiktok_post_id: string;
  profile_id: string | null;
  user_id: string | null;
  client_name: string | null;
  original_caption: string | null;
  original_post_url: string | null;
  original_thumbnail_url: string | null;
  media_type: string | null;
  tema: string | null;
  gancho: string | null;
  sugestao_readaptacao: string | null;
  hooks_magneticos: Record<string, string[]> | null;
  score_relevancia: number | null;
  transcricao: string | null;
  curtidas: number;
  visualizacoes: number;
  envios: number;
  created_at: string;
  updated_at: string;
  tiktok_posts?: TikTokPost | null;
}

export function normalizeTikTokUrl(input: string): string {
  const cleaned = input.trim();
  if (!cleaned) return "";
  if (/^https?:\/\//i.test(cleaned)) return cleaned;
  if (cleaned.startsWith("www.") || cleaned.startsWith("tiktok.com") || cleaned.startsWith("vm.tiktok.com")) {
    return `https://${cleaned}`;
  }
  if (cleaned.startsWith("@")) return `https://www.tiktok.com/${cleaned}`;
  return `https://www.tiktok.com/@${cleaned}`;
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

export function isTikTokSchemaMissingError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { code?: string; message?: string };
  return (
    maybeError.code === "PGRST205" ||
    maybeError.message?.includes("tiktok_profiles") === true ||
    maybeError.message?.includes("tiktok_posts") === true
  );
}
