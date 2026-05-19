export interface InspirationProfile {
  id: string;
  client_name: string;
  own_instagram: string;
  instagram_handle: string;
  max_posts_per_url: number;
  post_urls: string[] | null;
  custom_prompt: string | null;
  created_at: string;
}

export interface InspirationTarget {
  id: string;
  profile_id: string;
  instagram_url: string;
  created_at: string;
}

export interface InspirationPost {
  id: string;
  profile_id: string;
  post_url: string | null;
  thumbnail_url: string | null;
  caption: string | null;
  media_type: string | null;
  analysis: {
    tema?: string;
    formato_sugerido?: string;
    gancho?: string;
    sugestao_readaptacao?: string;
    score_relevancia?: number;
    descartar?: boolean;
    motivo_descarte?: string;
    [key: string]: unknown;
  } | null;
  readapted: boolean;
  created_at: string;
  curtidas?: number | null;
  visualizacoes?: number | null;
}

/** Extract clean handle from URL, @handle, or plain handle */
export function extractHandle(input: string): string {
  let cleaned = input.trim();
  // Remove full Instagram URL
  cleaned = cleaned.replace(/^https?:\/\/(www\.)?instagram\.com\//, "");
  // Remove trailing slashes, query params, etc.
  cleaned = cleaned.split(/[/?#]/)[0];
  // Remove @ prefix
  cleaned = cleaned.replace(/^@/, "");
  // Remove any remaining whitespace
  cleaned = cleaned.trim();
  return cleaned;
}
