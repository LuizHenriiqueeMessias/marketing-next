# MARKETING-NEXT

![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-149ECA?style=for-the-badge&logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?style=for-the-badge&logo=supabase&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)
![Public](https://img.shields.io/badge/Visibility-Public-2EA44F?style=for-the-badge&logo=github&logoColor=white)

## Visao geral

MARKETING-NEXT - Node.js, Python, TypeScript, React

Este repositorio foi organizado para manter o codigo-fonte, configuracoes e documentacao principal do projeto **MARKETING-NEXT**. O snapshot publicado remove dependencias instaladas, builds locais, caches e arquivos de ambiente reais para manter o repositorio limpo e seguro.

## Status do projeto

| Campo | Valor |
| --- | --- |
| Repositorio | `marketing-next` |
| Pasta local original | `IA-AVANT/MARKETING-NEXT` |
| Visibilidade | Publico |
| Producao | [https://criativos-api.railway.app](https://marketing-i9.vercel.app/) |
| Stack detectada | Node.js, Python, TypeScript, React, Vite, Supabase, Tailwind CSS, Docker, Vercel |

## Stack e arquitetura

| Camada | Tecnologias detectadas |
| --- | --- |
| Aplicacao | Node.js, Python, TypeScript, React, Vite, Supabase, Tailwind CSS, Docker, Vercel |
| Deploy | Vercel/configuracao por vercel.json |
| Banco/Backend as a Service | Supabase |
| Containerizacao | Docker/Docker Compose |

## Estrutura principal

- `.claude` - dir
- `.planning` - dir
- `Fluxos em Python` - dir
- `frontend` - dir
- `supabase` - dir
- `.gitignore` - file
- `CLAUDE.md` - file
- `Design-System-Criativos.html` - file

## Pacotes e workspaces

| Caminho | Pacote |
| --- | --- |
| `frontend\package.json` | `frontend` |

## Como rodar localmente

`ash
cd frontend
npm install
`

Depois da instalacao, confira os scripts disponiveis abaixo e crie um arquivo `.env` local com base nos exemplos versionados.

## Scripts conhecidos

| Script | Comando | Escopo |
| --- | --- | --- |
| `dev` | `vite` | frontend |
| `build` | `tsc -b && vite build` | frontend |
| `lint` | `eslint .` | frontend |
| `preview` | `vite preview` | frontend |

## Variaveis de ambiente

- `APIFY_TOKEN (Fluxos em Python\.env.example)`
- `APIFY_ACTOR_ID (Fluxos em Python\.env.example)`
- `APIFY_INSTAGRAM_REEL_ACTOR_ID (Fluxos em Python\.env.example)`
- `APIFY_TIKTOK_ACTOR_ID (Fluxos em Python\.env.example)`
- `APIFY_YOUTUBE_ACTOR_ID (Fluxos em Python\.env.example)`
- `APIFY_YOUTUBE_TRANSCRIPT_ACTOR_ID (Fluxos em Python\.env.example)`
- `SUPABASE_URL (Fluxos em Python\.env.example)`
- `SUPABASE_ANON (Fluxos em Python\.env.example)`
- `SUPABASE_SERVICE_KEY (Fluxos em Python\.env.example)`
- `ANTHROPIC_API_KEY (Fluxos em Python\.env.example)`
- `OPENROUTER_API_KEY (Fluxos em Python\.env.example)`
- `OPENROUTER_VISION_MODEL (Fluxos em Python\.env.example)`
- `GROQ_API_KEY (Fluxos em Python\.env.example)`
- `CLAUDE_MODEL_ESTATICOS (Fluxos em Python\.env.example)`
- `CLAUDE_MODEL_CARROSSEL (Fluxos em Python\.env.example)`
- `CLAUDE_MODEL_VIDEOS (Fluxos em Python\.env.example)`
- `CLAUDE_MODEL_TIKTOK (Fluxos em Python\.env.example)`
- `CLAUDE_MODEL_YOUTUBE (Fluxos em Python\.env.example)`
- `CLAUDE_MODEL_ADS (Fluxos em Python\.env.example)`
- `BACKEND_URL (Fluxos em Python\.env.example)`
- `FACEBOOK_ADS_ACTOR_ID (Fluxos em Python\.env.example)`
- `SCHEDULER_CRON_DAY_OF_WEEK (Fluxos em Python\.env.example)`
- `SCHEDULER_CRON_HOUR (Fluxos em Python\.env.example)`
- `SCHEDULER_CRON_MINUTE (Fluxos em Python\.env.example)`
- `SCHEDULER_MIN_INTERVAL_DAYS (Fluxos em Python\.env.example)`
- `VITE_SUPABASE_URL (frontend\.env.example)`
- `VITE_SUPABASE_ANON_KEY (frontend\.env.example)`
- `VITE_N8N_WEBHOOK_CRIATIVOS (frontend\.env.example)`
- `VITE_API_URL (frontend\.env.example)`

## Deploy

1. Configure as variaveis de ambiente no provedor de deploy.
2. Execute o build indicado pelo `package.json` ou pela configuracao do projeto.
3. Publique a branch `main`.
4. Atualize este README com a URL final de producao caso ela ainda esteja marcada como nao informada.

## Boas praticas aplicadas

- README na raiz para o GitHub renderizar a documentacao principal do repositorio.
- `.gitignore` com exclusao de `node_modules`, builds, caches, logs e arquivos `.env` reais.
- `.env.example` mantido quando existente para documentar configuracao sem expor segredos.
- Branch principal padronizada como `main`.
- Repositorios privados por padrao; somente `marketing-next` foi publicado como publico.
- Topicos GitHub configurados por stack para facilitar organizacao e busca.

## Seguranca

Nao commite tokens, chaves privadas, dumps de banco ou arquivos `.env` reais. Para novas credenciais, use secrets do GitHub/Vercel/Supabase ou o gerenciador de segredos do ambiente de producao.

## Manutencao

Projeto mantido por Luiz Henrique / AVANT I.A.
