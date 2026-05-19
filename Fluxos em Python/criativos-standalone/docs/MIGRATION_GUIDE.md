# Criativos — Guia de Migracao

## Estrutura extraida do N-Hub

```
criativos-standalone/
├── src/pages/
│   ├── Criativos/index.tsx          # Formulario de pedido de criativos (fotos/videos)
│   ├── Inspiracao/
│   │   ├── index.tsx                # Pagina principal — perfis + posts + tabs
│   │   ├── ProfileList.tsx          # CRUD de perfis de inspiracao
│   │   ├── PostsTable.tsx           # Tabela de posts com analise expandivel
│   │   ├── NewProfileDialog.tsx     # Dialog criar perfil
│   │   ├── EditProfileDialog.tsx    # Dialog editar perfil
│   │   └── types.ts                 # InspirationProfile, InspirationPost, InspirationTarget
│   ├── Readaptados/
│   │   ├── index.tsx                # Dashboard de posts readaptados (KPIs, tabela, export CSV)
│   │   └── EditMetricsDialog.tsx    # Editar curtidas/envios/views
│   └── ScrappingEspecifico/
│       └── index.tsx                # Scraping de URLs especificas do Instagram
│
├── supabase/
│   ├── functions/
│   │   ├── apify-proxy/index.ts     # Proxy para Apify (scraping IG) + webhooks N8N
│   │   ├── inspiracao-callback/     # Callback: atualiza last_scraped_at
│   │   └── readaptados-callback/    # Callback: upsert readapted_posts via N8N
│   └── migrations/
│       ├── 00_full_schema.sql       # ** SCHEMA COMPLETO — usar no projeto novo **
│       ├── 20260305_readapted_posts.sql
│       ├── 20260309_add_post_urls_to_profiles.sql
│       ├── 20260309_add_transcricao_to_readapted_posts.sql
│       └── 20260320_add_custom_prompt_to_profiles.sql
│
├── n8n/
│   ├── inspiracao-estaticos.json    # Workflow N8N: scraping fotos
│   ├── inspiracao-videos.json       # Workflow N8N: scraping videos
│   ├── prompt-readaptacao.txt       # Prompt v1 para AI readaptacao
│   └── prompt-readaptacaov2.txt     # Prompt v2 (simplificado)
│
└── docs/
    └── MIGRATION_GUIDE.md           # Este arquivo
```

## Dependencias que o frontend usa (do N-Hub)

### Imports que precisam ser adaptados

Todos os componentes importam de `@/...` que no N-Hub aponta para `./src/*`.
As dependencias compartilhadas sao:

| Import                                | O que e                        | Acao no novo projeto           |
|---------------------------------------|--------------------------------|--------------------------------|
| `@/integrations/supabase/client`      | Cliente Supabase (createClient)| Criar seu proprio client.ts    |
| `@/integrations/supabase/types`       | Types auto-gerados             | Gerar com `supabase gen types` |
| `@/components/ui/*`                   | shadcn/ui components           | Instalar shadcn/ui no projeto  |
| `@/hooks/use-toast`                   | Toast hook (shadcn)            | Ou usar `sonner` direto        |
| `@/hooks/useToolLogger`               | Logger de acoes                | Remover ou criar mock          |
| `@/contexts/ThemeContext`             | Cores dinamicas por BU         | Remover — usar cores fixas     |

### Pacotes NPM necessarios

```bash
npm install @supabase/supabase-js react-markdown framer-motion sonner lucide-react
# shadcn/ui (se usar):
npx shadcn-ui@latest init
npx shadcn-ui@latest add button input textarea label select switch checkbox alert-dialog dialog tooltip badge
```

## Setup do Supabase

1. Criar projeto no Supabase
2. Rodar `supabase/migrations/00_full_schema.sql` no SQL Editor
3. Deploy das edge functions:
   ```bash
   supabase functions deploy apify-proxy
   supabase functions deploy inspiracao-callback
   supabase functions deploy readaptados-callback
   ```
4. Configurar secrets nas edge functions:
   ```bash
   supabase secrets set APIFY_ACTOR_ID=xxx
   supabase secrets set APIFY_TOKEN=xxx
   supabase secrets set N8N_WEBHOOK_ESTATICOS=xxx
   supabase secrets set N8N_WEBHOOK_VIDEOS=xxx
   supabase secrets set N8N_WEBHOOK_CARROSSEL=xxx
   ```

## Variaveis de ambiente do frontend

```env
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxx
VITE_N8N_WEBHOOK_CRIATIVOS=https://n8n.i9automations.com/webhook/xxx
```

## O que remover/adaptar nos componentes

### 1. useToolLogger
Usado em todos os componentes para logging de acoes. No novo projeto voce pode:
- Remover todas as chamadas `log(...)` (nao afeta funcionalidade)
- Ou criar um mock: `export const useToolLogger = () => ({ log: () => {} })`

### 2. useTheme / activeBU
Usado apenas em `Criativos/index.tsx` para cores dinamicas. Substituir por cores fixas ou seu proprio theme system.

### 3. CSS Variables `--cr-*`
Todas as paginas Inspiracao/Readaptados/ScrappingEspecifico usam CSS variables com prefixo `--cr-`. Essas variaveis precisam ser definidas no CSS global:

```css
:root {
  --cr-font: 'Inter', sans-serif;
  --cr-bg: #0a0a0a;
  --cr-surface: rgba(255,255,255,0.03);
  --cr-surface-2: rgba(255,255,255,0.02);
  --cr-surface-hover: rgba(255,255,255,0.05);
  --cr-surface-active: rgba(232,96,74,0.04);
  --cr-text-1: #ffffff;
  --cr-text-2: rgba(255,255,255,0.65);
  --cr-text-3: rgba(255,255,255,0.35);
  --cr-border: rgba(255,255,255,0.08);
  --cr-border-hover: rgba(255,255,255,0.15);
  --cr-accent: #e8604a;
  --cr-accent-border: rgba(232,96,74,0.25);
  --cr-accent-muted: rgba(232,96,74,0.06);
  --cr-red: #e85454;
  --cr-red-muted: rgba(239,68,68,0.08);
  --cr-grad: linear-gradient(135deg, #c2396e 0%, #e8604a 100%);
  --cr-grad-soft: linear-gradient(135deg, rgba(194,57,110,0.12) 0%, rgba(232,96,74,0.12) 100%);
  --cr-score-high: #4ade80;
  --cr-score-mid: #fbbf24;
  --cr-score-low: #ef4444;
  --cr-green-muted: rgba(74,222,128,0.10);
  --cr-amber-muted: rgba(251,191,36,0.10);
  --cr-badge-video-bg: rgba(168,85,247,0.10);
  --cr-badge-video-color: #a855f7;
  --cr-badge-video-border: rgba(168,85,247,0.25);
  --cr-badge-carousel-bg: rgba(59,130,246,0.10);
  --cr-badge-carousel-color: #3b82f6;
  --cr-badge-carousel-border: rgba(59,130,246,0.25);
  --cr-badge-image-bg: rgba(34,197,94,0.10);
  --cr-badge-image-color: #22c55e;
  --cr-badge-image-border: rgba(34,197,94,0.25);
  --cr-dialog-bg: #141414;
  --cr-radius: 12px;
  --cr-radius-sm: 8px;
  --cr-radius-lg: 16px;
  --cr-violet: #8b5cf6;
  --cr-violet-muted: rgba(139,92,246,0.10);
  --cr-amber: #f59e0b;
  --cr-cyan: #06b6d4;
  --cr-cyan-muted: rgba(6,182,212,0.10);
  --cr-blue: #3b82f6;
  --cr-blue-muted: rgba(59,130,246,0.10);
  --cr-green: #22c55e;
  --cr-green-muted: rgba(34,197,94,0.10);
}
```

## Fluxo de dados (referencia para converter N8N → Python)

```
1. Usuario seleciona perfil e clica "Scrappear"
   → Frontend chama apify-proxy edge function
   → apify-proxy dispara Apify actor + registra webhooks N8N

2. Apify termina scraping
   → Dispara webhooks: estaticos / videos / carrossel
   → N8N recebe dados brutos do Apify

3. N8N processa cada post:
   a. Analisa conteudo com AI (prompt-readaptacao.txt)
   b. Salva resultado em inspiration_posts (via Supabase API)
   c. Se post foi readaptado, chama readaptados-callback

4. Frontend mostra posts em tempo real via Supabase queries
```

### Para converter N8N → Python:

Os workflows N8N fazem basicamente:
1. **Recebem webhook** do Apify com posts scraped
2. **Para cada post**: chamam a API da OpenAI/Claude com o prompt de readaptacao
3. **Salvam resultado** no Supabase via API REST

Em Python, isso seria:
```python
# Pseudocodigo
async def process_scraped_posts(posts, profile_id, client_name, own_instagram):
    for post in posts:
        # 1. Analise AI
        analysis = await call_claude(prompt_readaptacao, post)

        # 2. Salvar em inspiration_posts
        supabase.table("inspiration_posts").upsert({
            "profile_id": profile_id,
            "post_url": post["url"],
            "caption": post["caption"],
            "media_type": post["type"],
            "analysis": analysis,
        })

        # 3. Se nao descartado, criar readapted_post
        if not analysis.get("descartar"):
            supabase.table("readapted_posts").upsert({...})
```
