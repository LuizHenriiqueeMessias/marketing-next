# Phase 2: Collection and Analysis Pipeline - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Backend FastAPI pipeline que processa um ciclo completo: usuario dispara coleta de um concorrente, Apify scrapes o Facebook Ad Library, audio de videos e transcrito via Groq Whisper, imagens analisadas visualmente via Claude Vision, Claude gera analise JSON estruturada de copy — tudo persiste no Supabase sem corromper dados. CRUD de concorrentes fica no Supabase via RLS (nao no FastAPI).

</domain>

<decisions>
## Implementation Decisions

### Prompt de Analise de Ads
- **D-01:** Campos e conteudo todo em portugues (gancho, tipo_gancho, angulo, tag_angulo, cta, estrutura, score, insights) — consistente com fluxo de inspiracao
- **D-02:** JSON completo com todos os campos do requirement: gancho, tipo_gancho, angulo, tag_angulo, cta, estrutura, score 1-10, insights
- **D-03:** Score combina criterios de ad (clareza, qualidade do gancho, forca do CTA, originalidade) com criterios de inspiracao (relevancia, potencial engajamento, qualidade raciocinio)
- **D-04:** Prompt com identidade de analista neutro — sem persona fixa, foco em extracao objetiva de dados

### Fluxo de Coleta
- **D-05:** POST /ad-intelligence/collect dispara Apify actor via API com webhook de callback configurado. Quando Apify termina, chama endpoint de processamento. Mesmo padrao da inspiracao.
- **D-06:** Download de midia (imagens/videos para Supabase Storage) acontece durante o processamento do webhook — URLs do Facebook expiram em horas
- **D-07:** CRUD de concorrentes (COL-01, COL-02) via Supabase direto com RLS — frontend le/escreve Supabase diretamente, FastAPI so para processamento pesado. Consistente com decisao do STATE.md.

### Analise Vision
- **D-08:** Claude Vision direto via Anthropic API — sem OpenRouter, sem dependencia extra
- **D-09:** Chamada unica ao Claude: envia imagem + copy no mesmo request, retorna JSON completo. Menos latencia, menos custo, analise mais coerente.
- **D-10:** Para videos: envia thumbnail como imagem + transcricao Whisper como texto. Sem extracao de multiplos frames.

### Retry e Falhas
- **D-11:** 2 retries de parsing JSON antes de marcar como needs_reanalysis. Total de 3 tentativas.
- **D-12:** Falha individual em um ad nao para o batch — loga erro, marca ad com status de erro, continua processando proximos. Mesmo padrao do flows/videos.py.
- **D-13:** Tracking em ad_collection_runs: status (pending/processing/done/failed), total_ads, processed_ads, failed_ads, started_at, finished_at. Sem log detalhado por ad.
- **D-14:** Videos acima de 25MB: skip direto, marca transcription_skipped. Analise visual + copy ainda acontece. Sem ffmpeg no servidor.

### Claude's Discretion
Nenhuma area delegada — todas as decisoes foram tomadas pelo usuario.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Backend existente
- `Fluxos em Python/main.py` — Padrao de webhook + BackgroundTasks a seguir
- `Fluxos em Python/utils.py` — Helpers reutilizaveis: fetch_apify_dataset, call_claude, parse_llm_json, supabase_post/get
- `Fluxos em Python/flows/videos.py` — _transcribe_groq (mover para utils.py), padrao de processamento por item com try/except
- `Fluxos em Python/config.py` — API keys e configuracoes (Apify, Anthropic, Groq)
- `Fluxos em Python/prompts.py` — Referencia de formato de prompt (SYSTEM_MASTER) para manter consistencia de estilo

### Requisitos
- `.planning/REQUIREMENTS.md` — COL-01 a COL-03, ANA-01 a ANA-04, INF-04

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `utils.py:fetch_apify_dataset()` — Busca dataset Apify, reutilizar diretamente
- `utils.py:call_claude()` — Chamada Anthropic API, estender para suportar vision (image content blocks)
- `utils.py:parse_llm_json()` — Parser de JSON do LLM, adicionar retry logic
- `utils.py:supabase_post/get()` — CRUD Supabase via REST, reutilizar para ad_creatives e ad_analyses
- `utils.py:_client` — httpx.AsyncClient compartilhado
- `flows/videos.py:_transcribe_groq()` — Transcricao Groq Whisper, mover para utils.py

### Established Patterns
- Webhook recebe body → BackgroundTasks processa async → retorna 200 imediatamente
- Cada item processado individualmente com try/except (falha nao para o batch)
- Supabase REST API com headers de service key para bypass de RLS no backend
- Claude recebe system prompt + user message, retorna JSON puro

### Integration Points
- Novo endpoint POST /ad-intelligence/collect em main.py
- Novo endpoint POST /webhook/ad-intelligence (callback do Apify) em main.py
- Novo modulo flows/ad_intelligence.py seguindo padrao de flows/videos.py
- Novo prompt AD_ANALYSIS em prompts.py
- Supabase Storage para upload de midias baixadas

</code_context>

<specifics>
## Specific Ideas

- Score de ads combina criterios especificos de publicidade (clareza proposta, qualidade gancho, forca CTA, originalidade) com criterios ja existentes de inspiracao (relevancia, engajamento, qualidade) — hibrido
- _transcribe_groq deve ser movida de flows/videos.py para utils.py para compartilhar entre inspiracao e ads (decisao do STATE.md)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-collection-and-analysis-pipeline*
*Context gathered: 2026-03-26*
