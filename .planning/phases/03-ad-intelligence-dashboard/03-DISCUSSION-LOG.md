# Phase 3: Ad Intelligence Dashboard - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-26
**Phase:** 03-ad-intelligence-dashboard
**Areas discussed:** Layout dos ads, Página de detalhe, Navegação e routing, Filtros e export

---

## Layout dos ads

| Option | Description | Selected |
|--------|-------------|----------|
| Cards visuais | Grid de cards com thumbnail, score, formato. Novo padrão. | |
| Tabela como Inspiração | Tabela consistente com PostsTable.tsx existente. | |
| Híbrido | Toggle entre cards e tabela. Mais complexo mas flexível. | ✓ |

**User's choice:** Híbrido
**Notes:** Usuário escolhe visualização. Informações resumidas: thumbnail, score, formato badge, data, nome concorrente. Copy só no detalhe.

---

## Página de detalhe

| Option | Description | Selected |
|--------|-------------|----------|
| Duas colunas | Esquerda: criativo + copy. Direita: análise IA + transcrição. | ✓ |
| Seções empilhadas | Accordion expandível. Scroll único. | |
| Você decide | Claude escolhe layout. | |

**User's choice:** Duas colunas
**Notes:** Scroll independente por coluna.

---

## Navegação e routing

| Option | Description | Selected |
|--------|-------------|----------|
| Página única com tabs | /ad-intelligence. Tabs: Concorrentes e Anúncios. Detalhe em /:id | ✓ |
| Duas entradas na sidebar | Links separados para Concorrentes e Ads Intel. | |
| Página única sem tabs | Lista direto. Concorrentes em dialog. | |

**User's choice:** Página única com tabs
**Notes:** Uma entrada na sidebar. Tabs internas.

---

## Filtros e export

| Option | Description | Selected |
|--------|-------------|----------|
| Barra top com filtros inline | Filtros em linha. CSV à direita. | ✓ |
| Sidebar de filtros | Painel lateral. | |
| Você decide | Claude escolhe. | |

**User's choice:** Barra top com filtros inline

## Claude's Discretion

- Empty states, spacing, typography, animations
- Loading skeletons, error states
- CSV column format

## Deferred Ideas

None — discussion stayed within phase scope.
