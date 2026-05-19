# Phase 4: Scheduling and Automation - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

APScheduler dispara coleta semanal automatica para cada concorrente ativo, com verificacao de last_collected_at para evitar duplicatas. Badge numerico na sidebar e tab de Anuncios indica quantos ads novos desde a ultima visita do usuario (rastreado via localStorage).

</domain>

<decisions>
## Implementation Decisions

### Configuracao do Scheduler
- **D-01:** Intervalo semanal fixo — uma coleta por semana por concorrente com is_active=true
- **D-02:** Verificacao de last_collected_at antes de disparar novo run — se ultimo run < 6 dias atras, pula o concorrente
- **D-03:** Coleta toda segunda-feira as 8h BRT (11h UTC)

### Badge de Novos Anuncios
- **D-04:** Rastreio via localStorage — frontend salva timestamp da ultima visita a pagina Ad Intelligence. Compara com collected_at dos ads para contar novos.
- **D-05:** Badge numerico aparece na sidebar ("Ad Intelligence (3)") e na tab Anuncios. Visivel mesmo sem estar na pagina.

### Schema Additions
- **D-06:** Nova coluna `last_collected_at timestamptz` em ad_competitors — atualizada apos cada coleta completa. Scheduler consulta direto.

### Startup e Deploy
- **D-07:** AsyncIOScheduler — roda no mesmo event loop do FastAPI. Funciona com async functions como trigger_collection.
- **D-08:** Jobs em memoria apenas — recriados no startup via codigo. Se servidor reiniciar, rebuild dos jobs e instantaneo. Sem SQLAlchemy jobstore.

### Claude's Discretion
Nenhuma area delegada — todas as decisoes foram tomadas pelo usuario.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Backend existente
- `Fluxos em Python/flows/ad_intelligence.py` — trigger_collection(competitor_id, page_id) que o scheduler vai chamar
- `Fluxos em Python/main.py` — FastAPI app onde o scheduler sera inicializado no startup event
- `Fluxos em Python/config.py` — Configuracoes existentes, adicionar scheduler configs
- `Fluxos em Python/requirements.txt` — Adicionar apscheduler

### Schema existente
- `Fluxos em Python/criativos-standalone/supabase/migrations/20260326_ad_intelligence.sql` — Schema ad_competitors (is_active, sem last_collected_at ainda)

### Frontend existente
- `frontend/src/components/Layout.tsx` — NAV_ITEMS com badge support (Phase 3 adicionou Ad Intelligence)

### Requisitos
- `.planning/REQUIREMENTS.md` — COL-04, COL-05

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `trigger_collection(competitor_id, page_id)` em flows/ad_intelligence.py — scheduler chama esta funcao diretamente
- `supabase_get()` em utils.py — para buscar concorrentes ativos e last_collected_at
- `_update_collection_run()` em flows/ad_intelligence.py — para atualizar last_collected_at apos coleta
- Layout.tsx NAV_ITEMS — ja tem entrada Ad Intelligence, precisa adicionar badge count

### Established Patterns
- FastAPI startup events para inicializar servicos
- Supabase REST API para queries diretas
- localStorage para estado do usuario no frontend

### Integration Points
- Scheduler inicia no `@app.on_event("startup")` do main.py
- Scheduler chama trigger_collection para cada concorrente ativo
- Badge count via query Supabase: COUNT ads WHERE collected_at > localStorage timestamp
- Nova migration para ALTER TABLE ad_competitors ADD last_collected_at

</code_context>

<specifics>
## Specific Ideas

- Scheduler deve iterar ad_competitors com is_active=true, verificar last_collected_at < 6 dias, e chamar trigger_collection para cada um que precisa coleta
- Apos coleta completar com sucesso em process_ad_intelligence_webhook, atualizar last_collected_at do competitor
- Badge usa localStorage key como 'ad_intelligence_last_visited' com ISO timestamp

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-scheduling-and-automation*
*Context gathered: 2026-03-26*
