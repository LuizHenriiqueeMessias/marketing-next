# Criativos

## What This Is

Plataforma interna de gestão de criativos publicitários, migrada do N-Hub para app standalone. Permite scraping de inspiração via Apify, análise de copy/vídeo com IA (Claude, Groq Whisper, OpenRouter Vision), e gestão de criativos readaptados. Usado pela equipe de marketing/mídia paga.

## Core Value

Equipe de marketing consegue encontrar, analisar e reutilizar criativos de forma rápida e estruturada — sem depender de processos manuais ou plataformas externas.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- ✓ **AUTH-01**: Autenticação via Supabase Auth com controle de acesso — v1.0
- ✓ **INSP-01**: Scraping de perfis de inspiração via Apify — v1.0
- ✓ **INSP-02**: Análise de posts com Claude (copy, transcrição, visão) — v1.0
- ✓ **INSP-03**: Interface de perfis e posts de inspiração — v1.0
- ✓ **SCRAP-01**: Scraping específico de perfis sob demanda — v1.0
- ✓ **READ-01**: Gestão de criativos readaptados — v1.0
- ✓ **CRIA-01**: Página de criativos com filtros — v1.0
- ✓ **INF-01**: Tabelas Supabase para Ad Intelligence com RLS — v1.1 Phase 1
- ✓ **INF-02**: Coluna JSONB para dados brutos do Apify — v1.1 Phase 1
- ✓ **INF-03**: Storage bucket para mídias de anúncios — v1.1 Phase 1

### Active

<!-- Current scope. Building toward these. -->

(Defined in REQUIREMENTS.md per milestone)

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- App mobile nativo — web-first, equipe acessa via desktop
- Deploy on-premise — usa Vercel (frontend) + Render/similar (backend) + Supabase (DB)

## Context

- Frontend: React/Vite em `frontend/`, deploy via Vercel
- Backend: FastAPI em `Fluxos em Python/`, 3 endpoints webhook
- DB: Supabase (tabelas: inspiration_profiles, inspiration_targets, inspiration_posts, readapted_posts)
- External APIs: Apify (scraping), Claude/Anthropic (análise de copy), Groq (Whisper transcrição), OpenRouter (vision)
- Design system: arquivo `Design-System-Criativos.html` na raiz
- Edge Functions: em `supabase/functions/`

## Constraints

- **Stack**: React/Vite + FastAPI + Supabase — manter consistência com existente
- **APIs externas**: Apify para scraping, Anthropic para análise — já em uso
- **Custo**: Minimizar custos de API — usar Groq Whisper (grátis) em vez de OpenAI Whisper

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Migrar de N-Hub para standalone | N-Hub está sendo descontinuado | ✓ Good |
| Supabase como banco | Já em uso, auth integrado, edge functions | ✓ Good |
| FastAPI em vez de N8N | Mais controle, sem dependência de plataforma no-code | ✓ Good |
| Groq Whisper em vez de OpenAI | Custo zero vs ~$0.006/min | ✓ Good |
| Claude Vision direto (sem OpenRouter) para ads | Menos dependência, single call image+copy | ✓ Good |
| Competitor CRUD via Supabase RLS (não FastAPI) | Consistente com padrão Inspiração | ✓ Good |

## Current Milestone: v1.1 Ad Intelligence Pipeline

**Goal:** Integrar sistema de monitoramento de criativos de concorrentes via Facebook Ad Library dentro do Criativos existente.

**Target features:**
- Coleta automatizada de anúncios de concorrentes via Apify
- Transcrição de vídeos de anúncios com Whisper (Groq)
- Análise de imagens com Claude Vision
- Análise de copy com Claude (hook, ângulo, estrutura, CTA, score)
- Dashboard de Ad Intelligence no frontend React
- Agendamento de coleta recorrente

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-26 after Phase 4 completion — milestone v1.1 complete*
