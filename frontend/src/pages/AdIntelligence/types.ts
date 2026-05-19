export interface AdCompetitor {
  id: string;
  name: string;
  page_id: string | null;
  page_url: string | null;
  grupo: string | null;
  notas: string | null;
  is_active: boolean;
  avatar_url: string | null;
  last_collected_at: string | null;
  user_id: string | null;
  created_at: string;
}

export interface AdCreative {
  id: string;
  competitor_id: string;
  collection_run_id: string | null;
  ad_id: string | null;
  ad_url: string | null;
  creative_type: string | null;
  thumbnail_url: string | null;
  video_url: string | null;
  image_urls: string[] | null;
  body_text: string | null;
  cta_type: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string | null;
  platforms: string[] | null;
  storage_image_path: string | null;
  storage_video_path: string | null;
  transcricao: string | null;
  file_size_bytes: number | null;
  raw_apify_data: Record<string, unknown> | null;
  collected_at: string;
}

export interface AdAnalysis {
  id: string;
  creative_id: string;
  hook_text: string | null;
  hook_type: string | null;
  angle_tag: string | null;
  cta_analysis: string | null;
  structure_summary: string | null;
  relatorio_skill: string | null;
  score: number | null;
  insights: string | null;
  needs_reanalysis: boolean;
  prompt_version: string;
  full_analysis: Record<string, unknown> | null;
  created_at: string;
}

export interface AdCreativeWithRelations extends AdCreative {
  ad_competitors: AdCompetitor;
  ad_analyses: AdAnalysis | null;
}

export interface FilterState {
  grupo: string | null;
  competitorId: string | null;
  format: 'video' | 'image' | 'carousel' | null;
  minScore: number | null;
  startDateFrom: string | null;
  startDateTo: string | null;
  status: 'ativo' | 'inativo' | null;
}
