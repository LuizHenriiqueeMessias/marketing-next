# Phase 4: Scheduling and Automation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-26
**Phase:** 04-scheduling-and-automation
**Areas discussed:** Configuracao do scheduler, Badge de novos anuncios, Schema additions, Startup e deploy

---

## Configuracao do Scheduler

### Intervalo

| Option | Description | Selected |
|--------|-------------|----------|
| Semanal fixo (Recommended) | Uma coleta por semana por concorrente ativo | ✓ |
| Configuravel por concorrente | Cada concorrente com intervalo proprio | |
| Voce decide | Claude escolhe | |

**User's choice:** Semanal fixo

### Duplicata Check

| Option | Description | Selected |
|--------|-------------|----------|
| Checar last_collected_at (Recommended) | Se ultimo run < 6 dias, pula | ✓ |
| Checar status do ultimo run | Se run com status='running', pula | |
| Ambos | Data E status | |

**User's choice:** Checar last_collected_at

### Dia e Hora

| Option | Description | Selected |
|--------|-------------|----------|
| Segunda de manha (Recommended) | 8h BRT (11h UTC) | ✓ |
| Domingo de madrugada | 3h BRT (6h UTC) | |
| Voce decide | Claude escolhe | |

**User's choice:** Segunda de manha

---

## Badge de Novos Anuncios

### Rastreio

| Option | Description | Selected |
|--------|-------------|----------|
| localStorage (Recommended) | Timestamp da ultima visita no browser | ✓ |
| Tabela Supabase | user_page_visits com user_id + last_visited_at | |
| Voce decide | Claude escolhe | |

**User's choice:** localStorage

### Onde Aparece

| Option | Description | Selected |
|--------|-------------|----------|
| Sidebar + tab Anuncios (Recommended) | Badge numerico visivel na sidebar e tab | ✓ |
| Apenas nos cards | Indicador visual por card | |
| Ambos | Badge + indicador nos cards | |

**User's choice:** Sidebar + tab Anuncios

---

## Schema Additions

### last_collected_at

| Option | Description | Selected |
|--------|-------------|----------|
| Coluna em ad_competitors (Recommended) | ALTER TABLE ADD last_collected_at | ✓ |
| Derivar de ad_collection_runs | MAX(started_at) query | |
| Voce decide | Claude escolhe | |

**User's choice:** Coluna em ad_competitors

---

## Startup e Deploy

### Tipo de Scheduler

| Option | Description | Selected |
|--------|-------------|----------|
| AsyncIOScheduler (Recommended) | Mesmo event loop do FastAPI | ✓ |
| BackgroundScheduler | Thread separada | |
| Voce decide | Claude escolhe | |

**User's choice:** AsyncIOScheduler

### Persistencia

| Option | Description | Selected |
|--------|-------------|----------|
| Memoria apenas (Recommended) | Jobs recriados no startup | ✓ |
| SQLAlchemy jobstore | Jobs persistidos no banco | |
| Voce decide | Claude escolhe | |

**User's choice:** Memoria apenas

---

## Claude's Discretion

No areas deferred to Claude.

## Deferred Ideas

None — discussion stayed within phase scope.
