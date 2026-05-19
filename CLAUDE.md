# CLAUDE.md

Mapa real do projeto de scraping e conteudo em 2026-04-07.

## Estrutura real

- Backend principal: `Fluxos em Python/main.py`
- Helpers compartilhados: `Fluxos em Python/utils.py`
- Scrapers e pipelines:
  - `Fluxos em Python/flows/estaticos.py`
  - `Fluxos em Python/flows/carrossel.py`
  - `Fluxos em Python/flows/videos.py`
  - `Fluxos em Python/flows/ad_intelligence.py`
- Endpoints auxiliares de conteudo:
  - `Fluxos em Python/roteiro.py`
  - `Fluxos em Python/bestcontent.py`
- Edge functions relacionadas:
  - `Fluxos em Python/criativos-standalone/supabase/functions/apify-proxy/index.ts`
  - `Fluxos em Python/criativos-standalone/supabase/functions/youtube-callback/index.ts`

## Skills x implementacao real

| Skill | Arquivo principal | Endpoint / entrada | Status real |
| --- | --- | --- | --- |
| `ads-analyst` | `Fluxos em Python/flows/ad_intelligence.py` | `POST /ad-intelligence/collect` + `POST /webhook/ad-intelligence` | Funcional para Meta Ads Library |
| `transcribe` | `Fluxos em Python/flows/videos.py`, `Fluxos em Python/flows/carrossel.py` | `POST /webhook/videos`, `POST /webhook/carrossel` | Funcional para Instagram video e carrossel |
| `cortes-de-video` | `Fluxos em Python/flows/videos.py` | `POST /webhook/videos` | Funcional para videos transcritos |
| `hooks-magneticos` | `Fluxos em Python/flows/estaticos.py`, `Fluxos em Python/flows/carrossel.py`, `Fluxos em Python/flows/videos.py` | Fluxo interno apos analise principal | Funcional para os 3 scrapers de Instagram |
| `roteiro-pauta-quente` | `Fluxos em Python/roteiro.py` | `POST /roteiro/generate` | Funcional com base em `inspiration_posts` |
| `bestcontent` | `Fluxos em Python/bestcontent.py` | `POST /bestcontent/rank` | Funcional para ranking de listas de posts |

## Endpoints backend ativos

- `GET /health`
- `POST /webhook/estaticos`
- `POST /webhook/carrossel`
- `POST /webhook/videos`
- `POST /ad-intelligence/collect`
- `POST /webhook/ad-intelligence`
- `POST /roteiro/generate`
- `POST /bestcontent/rank`

## O que cada scraper faz

### `estaticos.py`

- Coleta posts de imagem simples do Instagram.
- Filtra `type != Video`, `type != Sidecar` e nao pinados.
- Salva analise principal em `inspiration_posts`.
- Gera `hooks_magneticos` e salva em `readapted_posts`.

Campos usados com mais frequencia:
- `inspiration_posts.analysis`
- `inspiration_posts.caption`
- `inspiration_posts.thumbnail_url`
- `readapted_posts.tema`
- `readapted_posts.gancho`
- `readapted_posts.sugestao_readaptacao`
- `readapted_posts.hooks_magneticos`

### `carrossel.py`

- Coleta carrosseis do Instagram.
- Extrai texto dos slides com OpenRouter Vision.
- Gera `transcricao` e `transcricao_formatada`.
- Salva analise em `inspiration_posts`.
- Gera `hooks_magneticos` em `readapted_posts`.

Campos usados com mais frequencia:
- `inspiration_posts.transcricao`
- `inspiration_posts.transcricao_formatada`
- `inspiration_posts.analysis`
- `readapted_posts.transcricao`
- `readapted_posts.hooks_magneticos`

### `videos.py`

- Coleta videos do Instagram.
- Baixa audio/video e transcreve com Groq Whisper.
- Gera `transcricao_formatada`.
- Gera `cortes_sugeridos`.
- Salva analise em `inspiration_posts`.
- Gera `hooks_magneticos` em `readapted_posts`.

Campos usados com mais frequencia:
- `inspiration_posts.transcricao`
- `inspiration_posts.transcricao_formatada`
- `inspiration_posts.cortes_sugeridos`
- `inspiration_posts.analysis`
- `readapted_posts.transcricao`
- `readapted_posts.hooks_magneticos`

### `ad_intelligence.py`

- Dispara scraper da Meta Ads Library via Apify.
- Baixa thumbnail/video, transcreve quando cabivel e analisa com Claude.
- Persiste criativos em `ad_creatives`.
- Persiste analises em `ad_analyses`.
- O prompt agora inclui a secao `relatorio_skill` para `ads-analyst`.

Campos usados com mais frequencia:
- `ad_creatives.body_text`
- `ad_creatives.transcricao`
- `ad_creatives.storage_image_path`
- `ad_creatives.storage_video_path`
- `ad_analyses.full_analysis`
- `ad_analyses.score`
- `ad_analyses.insights`

## Integracoes auxiliares

### `roteiro.py`

- Funcao principal: `generate_roteiro(nicho, formato, persona, tom)`
- Fonte de contexto: posts recentes de `inspiration_posts`
- Saida: JSON com tema quente, insight central, angulo, gancho, roteiro, assets e referencias trending

### `bestcontent.py`

- Funcao principal: `rank_and_curate(posts, marca_contexto)`
- Entrada: lista de posts ja coletados do banco
- Score local:
  - `engajamento_relativo`
  - `relevancia`
  - `originalidade`
  - `replicacao`
  - `trending`
- Enriquecimento final: adaptacao sugerida via Claude para os top 5

## Migrations novas relacionadas a skills

- `Fluxos em Python/criativos-standalone/supabase/migrations/20260407_add_transcricao_formatada_to_inspiration_posts.sql`
- `Fluxos em Python/criativos-standalone/supabase/migrations/20260407_add_cortes_sugeridos_to_inspiration_posts.sql`
- `Fluxos em Python/criativos-standalone/supabase/migrations/20260407_add_hooks_magneticos_to_readapted_posts.sql`

## Pendencias reais

- `ads-analyst`: falha por RLS no Supabase sem `SUPABASE_SERVICE_KEY` com permissao de insert em `ad_collection_runs`.
- `transcribe`: depende de `GROQ_API_KEY` valido e de um downloader real de YouTube (nao existe no repo).
- `TikTok` segue ausente no backend.
- `YouTube` existe no callback Supabase, mas ainda sem transcricao, cortes ou hooks.
- Os arquivos `.claude/skills/.../SKILL.md` nao existem neste repo, entao a implementacao foi baseada nas tarefas descritas no chat.
- Ha drift de schema historico no projeto:
  - `inspiration_posts.transcricao`
  - `inspiration_posts.transcricao_formatada`
  - `inspiration_posts.cortes_sugeridos`
  - `readapted_posts.hooks_magneticos`
  Essas migrations precisam ser aplicadas no banco real.
- O frontend ainda nao consome `roteiro-pauta-quente` nem `bestcontent`.
- Parte do fluxo Instagram ainda convive com a arquitetura antiga `frontend -> apify-proxy -> Apify`, enquanto o backend Python ja tem fluxos proprios.
- O ambiente local atual esta com a `.venv` apontando para um Python removido (`Python314`), entao validacao por `py_compile` ficou bloqueada ate corrigir o runtime.

## Observacao operacional

Se uma nova tarefa mencionar `backend/...`, neste projeto isso corresponde ao backend real em `Fluxos em Python/...`.
