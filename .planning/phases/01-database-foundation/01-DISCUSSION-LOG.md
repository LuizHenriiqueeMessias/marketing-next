# Phase 1: Database Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-26
**Phase:** 01-database-foundation
**Areas discussed:** Storage de mídia, Modelo do concorrente, Granularidade da análise

---

## Storage de mídia

| Option | Description | Selected |
|--------|-------------|----------|
| Supabase Storage | Baixar na coleta e subir para bucket Supabase. Custo de storage, mas mídia nunca expira. | ✓ |
| Só thumbnail no Storage | Thumbnails no Storage, vídeos como URL temporária. Economia, mas vídeos podem sumir. | |
| URLs diretas do Facebook | Não baixar nada — usar URLs do CDN direto. Zero custo, mas expiram em ~24h. | |

**User's choice:** Supabase Storage (Recommended)
**Notes:** URLs do Facebook CDN expiram em ~24h, precisa persistir mídias para referência futura.

---

## Modelo do concorrente

| Option | Description | Selected |
|--------|-------------|----------|
| Completo com grupo | nome, page_id, page_url, grupo, notas, is_active, avatar_url, created_at | ✓ |
| Mínimo + grupo | nome, page_id, grupo, is_active, created_at | |
| Mínimo simples | nome, page_id, is_active, created_at | |

**User's choice:** Completo com grupo
**Notes:** Suporta agrupamento por marca/segmento (UI-04) desde o início.

---

## Granularidade da análise

| Option | Description | Selected |
|--------|-------------|----------|
| Tabela separada | ad_analyses com colunas tipadas. Evita JSON-inside-JSON, permite filtro por score no SQL. | ✓ |
| JSONB na ad_creatives | Coluna 'analysis jsonb' dentro de ad_creatives. Mais simples mas dificulta filtros. | |

**User's choice:** Tabela separada (Recommended)
**Notes:** Colunas tipadas permitem filtro direto por score sem parsear JSON no frontend.

---

## Claude's Discretion

- Nomes exatos de colunas de ad_creatives
- Indexes para performance
- Política de RLS (seguir padrão authenticated)
- Estrutura do bucket no Supabase Storage

## Deferred Ideas

None — discussion stayed within phase scope.
