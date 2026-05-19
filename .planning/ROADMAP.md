# Roadmap: Criativos — Ad Intelligence Pipeline (v1.1)

## Overview

This milestone adds competitive ad monitoring to the existing Criativos app. The pipeline follows the same pattern already proven in the Inspiracao flow: Apify scrapes content, Groq Whisper transcribes video audio, Claude analyzes the content, results land in Supabase, and a React dashboard reads directly from the database. Four phases respect the hard dependency chain: database schema must exist before the backend can write, the backend must produce data before the frontend can display it, and scheduling is deferred until the manual collection flow is validated by the team.

## Milestones

- 🚧 **v1.1 Ad Intelligence Pipeline** - Phases 1-4 (in progress)

## Phases

### 🚧 v1.1 Ad Intelligence Pipeline (In Progress)

**Milestone Goal:** Equipe de marketing consegue monitorar criativos de concorrentes do Facebook Ad Library, ver análise de IA estruturada (hook, ângulo, score), e disparar coletas sob demanda — tudo dentro do Criativos existente.

- [x] **Phase 1: Database Foundation** - Criar schema Supabase com RLS, tabelas de tracking de runs e estratégia de persistência de mídia (completed 2026-03-26)
- [x] **Phase 2: Collection and Analysis Pipeline** - Backend FastAPI: coleta Apify, transcrição Whisper, análise Claude com retry de JSON (completed 2026-03-26)
- [x] **Phase 3: Ad Intelligence Dashboard** - Frontend React completo: competitor management, tabela de anúncios, filtros, detalhe e export CSV (completed 2026-03-26)
- [x] **Phase 4: Scheduling and Automation** - APScheduler semanal por concorrente e badge de novos anúncios (completed 2026-03-26)

## Phase Details

### Phase 1: Database Foundation
**Goal**: Schema Supabase completo existe com RLS, indexes, tabela de run tracking, e estratégia de persistência de mídia definida — tudo antes de qualquer dado fluir pelo pipeline
**Depends on**: Nothing (first phase)
**Requirements**: INF-01, INF-02, INF-03, INF-04
**Success Criteria** (what must be TRUE):
  1. As três tabelas novas (ad_competitors, ad_creatives, ad_analyses) existem no Supabase com RLS habilitado e uma query com anon key retorna 403 ou array vazio (não dados brutos)
  2. A tabela ad_collection_runs existe e registra status de cada run (pending, processing, done, failed) — dashboard tem visibilidade de runs travados
  3. A coluna raw_apify_data JSONB existe em ad_creatives — schema incerto do Apify não bloqueia coleta; campo absorve formato desconhecido
  4. Mídias (thumbnails, vídeos) são baixadas para Supabase Storage na coleta — URLs CDN do Facebook não são armazenadas como referência primária
**Plans:** 1/1 plans complete
Plans:
- [x] 01-01-PLAN.md — Complete schema migration (4 tables + RLS + indexes + storage bucket)

### Phase 2: Collection and Analysis Pipeline
**Goal**: Backend processa um ciclo completo: usuário dispara coleta, Apify scrapes o Facebook Ad Library, áudio é transcrito, imagens analisadas visualmente, Claude gera análise JSON estruturada — tudo persiste sem corromper dados
**Depends on**: Phase 1
**Requirements**: COL-01, COL-02, COL-03, ANA-01, ANA-02, ANA-03, ANA-04
**Success Criteria** (what must be TRUE):
  1. POST /ad-intelligence/collect dispara um Apify actor run para um concorrente e retorna imediatamente — usuário não espera o processamento
  2. Vídeos de anúncios com áudio em PT-BR são transcritos pelo Groq Whisper; vídeos acima de 25MB são marcados com transcription_skipped em vez de falhar a coleta inteira
  3. Claude retorna JSON estruturado válido com hook, angle, structure, cta_analysis, score e insights — análise com parse_failed não é salva no banco sem flag de needs_reanalysis
  4. Dataset Apify com 0 itens é detectado e registrado como falha de coleta em ad_collection_runs — não silenciosamente aceito como sucesso
  5. Concorrentes podem ser adicionados (nome + page_id) e removidos pelo backend CRUD — endpoints funcionam independente do frontend
**Plans:** 2 plans
Plans:
- [x] 02-01-PLAN.md — Shared utilities: move _transcribe_groq, extend call_claude for vision, add parse_with_retry, config constants, AD_ANALYSIS prompt
- [x] 02-02-PLAN.md — Collection flow + endpoints: flows/ad_intelligence.py module, 2 new routes in main.py

### Phase 3: Ad Intelligence Dashboard
**Goal**: Usuário consegue gerenciar concorrentes, ver anúncios com filtros, ver análise completa de IA em detalhe, exportar lista filtrada — tudo numa página React dentro do Criativos existente
**Depends on**: Phase 2
**Requirements**: UI-01, UI-02, UI-03, UI-04, UI-05
**Success Criteria** (what must be TRUE):
  1. Usuário pode filtrar anúncios por data, formato (imagem/vídeo/carrossel), status (ativo/inativo) e score — cards atualizam em tempo real conforme filtros mudam
  2. Usuário pode clicar em um anúncio e ver detalhe completo: criativo (imagem ou vídeo inline), copy, transcrição de vídeo, e análise IA (hook, ângulo, CTA, estrutura, score 1-10)
  3. Usuário pode exportar a lista filtrada atual em CSV — arquivo baixa no browser com campos relevantes
  4. Usuário pode agrupar concorrentes por marca/segmento e filtrar por grupo — organização funciona com 10+ páginas monitoradas
  5. Cards e detalhe mostram resultados da análise IA com fallback visual para campos ausentes — nenhum campo exibe "undefined" ou quebra o componente
**Plans:** 4/4 plans complete
Plans:
- [x] 03-01-PLAN.md — Types, routing, navigation, and page shell scaffold
- [x] 03-02-PLAN.md — Competitors CRUD tab (table, add/edit/delete dialogs, collection trigger)
- [x] 03-03-PLAN.md — Ads list tab (filter bar, card/table toggle, CSV export)
- [x] 03-04-PLAN.md — Ad detail page (two-column layout, media, AI analysis cards)

### Phase 4: Scheduling and Automation
**Goal**: Coleta semanal acontece automaticamente por concorrente ativo sem ação manual, e usuário vê badge indicando anúncios novos desde a última visita
**Depends on**: Phase 3
**Requirements**: COL-04, COL-05
**Success Criteria** (what must be TRUE):
  1. APScheduler dispara coleta semanal automaticamente para cada ad_competitor com is_active=true — equipe não precisa lembrar de clicar
  2. Scheduler verifica last_collected_at antes de disparar novo run — não cria runs duplicados se run anterior ainda está processando
  3. Anúncios novos desde a última visita do usuário mostram badge visual — usuário sabe o que é novo sem ler todos os cards
**Plans:** 2/2 plans complete
Plans:
- [x] 04-01-PLAN.md — APScheduler weekly cron + last_collected_at migration + lifespan wiring
- [x] 04-02-PLAN.md — New ads badge (useNewAdsCount hook + sidebar badge + tab badge)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Database Foundation | v1.1 | 1/1 | Complete   | 2026-03-26 |
| 2. Collection and Analysis Pipeline | v1.1 | 2/2 | Complete | 2026-03-26 |
| 3. Ad Intelligence Dashboard | v1.1 | 4/4 | Complete | 2026-03-26 |
| 4. Scheduling and Automation | v1.1 | 2/2 | Complete | 2026-03-26 |
