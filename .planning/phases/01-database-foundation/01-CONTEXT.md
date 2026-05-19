# Phase 1: Database Foundation - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Criar schema Supabase completo com RLS, tabela de run tracking, estratégia de persistência de mídia, e coluna JSONB de safety net — tudo antes de qualquer dado fluir pelo pipeline. Não inclui backend endpoints nem frontend.

</domain>

<decisions>
## Implementation Decisions

### Storage de mídia
- **D-01:** Mídias (thumbnails e vídeos) devem ser baixadas no momento da coleta e armazenadas no Supabase Storage (bucket dedicado). URLs do CDN do Facebook expiram em ~24h e não devem ser referência primária.
- **D-02:** Armazenar o path do Storage na tabela ad_creatives (ex: `storage_image_path`, `storage_video_path`) além das URLs originais do Apify.

### Modelo do concorrente
- **D-03:** Tabela ad_competitors com campos completos: nome, page_id, page_url, grupo (marca/segmento), notas, is_active, avatar_url, created_at. Suporta agrupamento (UI-04) desde o início do schema.
- **D-04:** Campo `grupo` é text nullable — permite agrupamento opcional sem forçar categorização.

### Granularidade da análise
- **D-05:** Resultados da análise IA em tabela separada `ad_analyses` com colunas tipadas (hook_text, hook_type, angle_tag, cta_analysis, structure_summary, score, insights, needs_reanalysis, prompt_version). Não usar JSONB para os campos de análise.
- **D-06:** Relação 1:1 entre ad_creatives e ad_analyses via foreign key. Permite filtro por score direto no SQL/Supabase sem parsear JSON no frontend.

### Claude's Discretion
- Nomes exatos de colunas da tabela ad_creatives (baseado no output do Apify)
- Indexes específicos para performance
- Política de RLS exata (seguir padrão existente: authenticated users full access)
- Estrutura do bucket no Supabase Storage (naming convention)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing schema patterns
- `Fluxos em Python/criativos-standalone/supabase/migrations/20260305_readapted_posts.sql` — Padrão de migração existente: CREATE TABLE IF NOT EXISTS, RLS policies, indexes
- `Fluxos em Python/config.py` — Configuração Supabase (URL, keys, headers) e padrão de service-role key para bypass RLS no backend

### Research
- `.planning/research/ARCHITECTURE.md` — Schema design proposto, relações entre tabelas, build order
- `.planning/research/PITFALLS.md` — RLS default desabilitado, URLs expiram, Apify empty dataset, 25MB limit
- `.planning/research/STACK.md` — Apify actor output fields, JSONB safety net rationale

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Fluxos em Python/utils.py`: Funções `supabase_post`, `supabase_get` que usam REST API do Supabase com headers de service-role key — novo flow de ads vai usar o mesmo padrão
- `frontend/src/integrations/supabase/client.ts`: Client Supabase do frontend — novas tabelas serão lidas com `.from('ad_creatives').select()`

### Established Patterns
- Migrations: SQL puro em `supabase/migrations/` com `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE` para idempotência
- RLS: Todas as tabelas usam `ENABLE ROW LEVEL SECURITY` + policies para `authenticated` role (SELECT/INSERT/UPDATE/DELETE)
- Backend usa service-role key (bypass RLS), frontend usa anon key (subject to RLS)
- Tabelas existentes: `inspiration_profiles`, `inspiration_targets`, `inspiration_posts`, `readapted_posts`

### Integration Points
- Novas tabelas seguem naming convention existente: snake_case, `created_at timestamptz DEFAULT now()`
- Foreign keys com ON DELETE CASCADE (padrão de readapted_posts)
- Supabase Storage bucket para mídias — novo pattern, não existe ainda no projeto

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches following existing migration patterns.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-database-foundation*
*Context gathered: 2026-03-26*
