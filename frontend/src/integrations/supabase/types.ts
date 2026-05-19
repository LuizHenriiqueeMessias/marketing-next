export type Tables<T extends string> = T extends "readapted_posts"
  ? {
      id: string;
      inspiration_post_id: string | null;
      profile_id: string | null;
      client_name: string | null;
      original_caption: string | null;
      original_post_url: string | null;
      original_thumbnail_url: string | null;
      media_type: string | null;
      tema: string | null;
      gancho: string | null;
      sugestao_readaptacao: string | null;
      score_relevancia: number | null;
      status: string | null;
      curtidas: number;
      envios: number;
      visualizacoes: number;
      transcricao: string | null;
      observacoes: string | null;
      created_at: string;
    }
  : T extends "inspiration_posts"
    ? {
        id: string;
        profile_id: string;
        post_url: string | null;
        thumbnail_url: string | null;
        caption: string | null;
        media_type: string | null;
        analysis: Record<string, unknown> | null;
        readapted: boolean;
        curtidas: number | null;
        visualizacoes: number | null;
        created_at: string;
      }
    : T extends "inspiration_profiles"
      ? {
          id: string;
          client_name: string;
          own_instagram: string;
          instagram_handle: string;
          max_posts_per_url: number;
          post_urls: string[] | null;
          custom_prompt: string | null;
          created_at: string;
        }
      : T extends "inspiration_targets"
        ? {
            id: string;
            profile_id: string;
            instagram_url: string;
            created_at: string;
          }
        : never;
