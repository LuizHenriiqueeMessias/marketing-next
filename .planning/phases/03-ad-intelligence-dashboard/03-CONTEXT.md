# Phase 3: Ad Intelligence Dashboard - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Frontend React completo para Ad Intelligence: página com tabs (Concorrentes CRUD + Anúncios lista), toggle cards/tabela, filtros inline no topo, detalhe em duas colunas (criativo + análise IA), export CSV, agrupamento de concorrentes. Lê Supabase diretamente (não via FastAPI).

</domain>

<decisions>
## Implementation Decisions

### Layout dos ads
- **D-01:** Toggle híbrido entre cards visuais e tabela — usuário escolhe a visualização preferida
- **D-02:** Informações resumidas no card/linha: thumbnail, score (dots bar), formato badge (vídeo/imagem/carrossel), data de início, nome do concorrente. Copy completo só no detalhe.
- **D-03:** Score bar reutiliza padrão existente do ScoreBar component (dots com cores high/mid/low) da Inspiração

### Página de detalhe
- **D-04:** Layout de duas colunas — esquerda: criativo (vídeo/imagem inline) + copy original do anúncio. Direita: análise IA (gancho, tipo_gancho, ângulo, tag_angulo, CTA, estrutura, score, insights) + transcrição de vídeo. Scroll independente por coluna.
- **D-05:** Detalhe abre como sub-rota /ad-intelligence/:id, não como dialog/modal

### Navegação e routing
- **D-06:** Uma entrada na sidebar: "Ad Intelligence" em /ad-intelligence
- **D-07:** Dentro da página: tabs para "Concorrentes" (CRUD de páginas monitoradas) e "Anúncios" (lista com filtros)
- **D-08:** Detalhe do anúncio como sub-rota: /ad-intelligence/:id
- **D-09:** Adicionar item no NAV_ITEMS do Layout.tsx — entre "Scrapping Especifico" e "Readaptados"

### Filtros e export
- **D-10:** Barra de filtros inline no topo da lista: dropdown concorrente, dropdown formato (vídeo/imagem/carrossel), select score mínimo, date range, toggle ativo/inativo
- **D-11:** Botão "Exportar CSV" à direita da barra de filtros — exporta lista atualmente filtrada
- **D-12:** Filtros aplicados client-side usando state React (dados já carregados do Supabase)

### Concorrentes CRUD
- **D-13:** Tab "Concorrentes" mostra tabela simples com nome, page_id, grupo, is_active, ações (editar/remover)
- **D-14:** Adicionar concorrente via dialog (nome, page_id, page_url, grupo, notas)
- **D-15:** Agrupamento por campo `grupo` — dropdown filter na lista de anúncios filtra por grupo do concorrente

### Claude's Discretion
- Empty state illustrations/text
- Exact spacing, typography, animations (seguir design system existente)
- Loading skeleton design
- Error state handling
- Formato exato das colunas do CSV export

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Frontend patterns
- `frontend/src/pages/Inspiracao/index.tsx` — Padrão de página principal com sub-componentes, ScoreBar component, media badges, supabase queries
- `frontend/src/pages/Inspiracao/PostsTable.tsx` — Padrão de tabela com filtros, search, expand/collapse, media rendering
- `frontend/src/pages/Inspiracao/ProfileList.tsx` — Padrão de CRUD list component
- `frontend/src/pages/Inspiracao/types.ts` — Padrão de type definitions por página
- `frontend/src/components/Layout.tsx` — Sidebar navigation, NAV_ITEMS array, route structure
- `frontend/src/integrations/supabase/client.ts` — Supabase client singleton

### Design System
- `Design-System-Criativos.html` — Design tokens, CSS variables, component patterns

### Schema (dados que o frontend lê)
- `Fluxos em Python/criativos-standalone/supabase/migrations/20260326_ad_intelligence.sql` — Tabelas ad_competitors, ad_creatives, ad_analyses com seus campos

### Prior decisions
- `.planning/phases/02-collection-and-analysis-pipeline/02-CONTEXT.md` — D-01: campos em português, D-07: frontend lê Supabase direto

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ScoreBar` component (Inspiracao/index.tsx): dots visualization com cores high/mid/low — reutilizar para score de ads
- `getMediaBadgeClass/Label/Icon` helpers: badges para vídeo/carrossel/imagem — reutilizar com mapeamento de tipos do Ad Library
- `Badge` component (ui/badge.tsx): styled badges para status e formato
- `Button`, `Input`, `Select`, `Dialog`, `Switch`, `Checkbox`, `Tooltip` — todos disponíveis em components/ui/
- `motion` (framer-motion): já em uso para animações
- `toast` (sonner): já em uso para notificações
- `lucide-react`: ícones já em uso no projeto

### Established Patterns
- Páginas lêem Supabase diretamente com `supabase.from('tabela').select('*')`
- useState + useEffect para data fetching (sem React Query/TanStack Query)
- CSS via design system global (variáveis CSS) + classes customizadas
- Componentes co-localizados na pasta da página (types.ts, sub-components)
- Navigation via react-router-dom NavLink no Layout.tsx

### Integration Points
- Nova pasta `frontend/src/pages/AdIntelligence/` com index.tsx, types.ts, sub-components
- Novo item no NAV_ITEMS em Layout.tsx
- Nova rota em App.tsx (ou router config)
- Supabase queries para ad_competitors, ad_creatives, ad_analyses (joins)

</code_context>

<specifics>
## Specific Ideas

- Toggle cards/tabela deve ter estado persistido (localStorage) para não resetar entre navegações
- Score bar usa mesmo visual da Inspiração (5 dots coloridos) para consistência visual
- Tab "Concorrentes" é mais simples — CRUD básico, sem visualização elaborada
- Tab "Anúncios" é a view principal — filtros + lista + toggle view mode

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 03-ad-intelligence-dashboard*
*Context gathered: 2026-03-26*
