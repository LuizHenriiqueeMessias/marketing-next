# Quick Task 260406-ovi Plan

**Date:** 2026-04-06
**Status:** Completed

## Goal

Criar um scraper de YouTube seguindo o mesmo padrao arquitetural do scraper de Instagram existente (Inspiracao), cobrindo schema Supabase, trigger Apify, callback de persistencia, frontend React e navegacao.

## Tasks

1. **Schema + types**  
   Criar migration com `youtube_channels` e `youtube_videos`, RLS, indexes e atualizacao de permissoes/defaults; refletir as novas tabelas em `frontend/src/integrations/supabase/types.ts`.

2. **Pipeline de coleta**  
   Estender `apify-proxy` para suportar o actor `streamers/youtube-scraper` e criar `youtube-callback` para buscar o dataset do Apify e fazer upsert de canal + videos no Supabase.

3. **Frontend + routing**  
   Criar a pagina `frontend/src/pages/YouTube/` com lista de canais, dialog de cadastro, tabela de videos com preview inline, acao de scraping, rota `/youtube` e permissao correspondente no menu e na tela de usuarios.

## Verification

- `npm run build` em `frontend/`
