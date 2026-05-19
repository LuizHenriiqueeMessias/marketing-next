# Requirements: Criativos — Ad Intelligence Pipeline

**Defined:** 2026-03-26
**Core Value:** Equipe de marketing consegue encontrar, analisar e reutilizar criativos de forma rápida e estruturada

## v1.1 Requirements

Requirements for Ad Intelligence Pipeline milestone. Each maps to roadmap phases.

### Coleta (Collection)

- [ ] **COL-01**: Usuário pode adicionar página de concorrente (nome + page_id do Facebook)
- [ ] **COL-02**: Usuário pode remover página de concorrente do monitoramento
- [ ] **COL-03**: Usuário pode disparar coleta manual de anúncios de um concorrente via Apify
- [x] **COL-04**: Sistema coleta anúncios automaticamente em schedule semanal (APScheduler)
- [x] **COL-05**: Sistema indica anúncios novos desde a última visita do usuário (badge)

### Análise (Analysis)

- [ ] **ANA-01**: Sistema transcreve áudio de vídeos de anúncios via Groq Whisper (PT-BR)
- [ ] **ANA-02**: Sistema analisa imagens de anúncios via Claude Vision (OCR + descrição visual)
- [ ] **ANA-03**: Sistema analisa copy com Claude retornando JSON estruturado (hook, hook_type, ângulo, angle_tag, CTA, estrutura, score 1-10)
- [ ] **ANA-04**: Sistema valida JSON de análise e faz retry em caso de falha de parsing

### Interface (Dashboard)

- [x] **UI-01**: Usuário pode ver lista de anúncios em cards com filtros (data, formato, ativo/inativo, score)
- [x] **UI-02**: Usuário pode ver detalhe completo de um anúncio (criativo, copy, transcrição, análise IA)
- [x] **UI-03**: Usuário pode exportar lista filtrada de anúncios em CSV
- [x] **UI-04**: Usuário pode agrupar concorrentes por marca/segmento
- [x] **UI-05**: Usuário pode ver resultados da análise IA renderizados no card e no detalhe

### Infraestrutura (Infrastructure)

- [x] **INF-01**: Tabelas Supabase criadas com RLS habilitado (ad_competitors, ad_creatives, ad_analyses)
- [x] **INF-02**: Sistema armazena dados brutos do Apify em coluna JSONB (safety net para schema incerto)
- [x] **INF-03**: Sistema baixa mídias (imagens/vídeos) no momento da coleta (URLs expiram em horas)
- [x] **INF-04**: Sistema verifica tamanho do vídeo antes de transcrição (limite 25MB do Groq)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Comparação & Analytics

- **COMP-01**: Usuário pode comparar dois anúncios lado a lado
- **COMP-02**: Usuário pode ver estatísticas agregadas por concorrente (total de ads, score médio, formatos)

### Multi-plataforma

- **PLAT-01**: Sistema coleta anúncios de TikTok Ad Library
- **PLAT-02**: Sistema coleta anúncios de Google Ads Transparency Center

### Notificações

- **NOTF-01**: Usuário recebe notificação por email quando concorrente lança 5+ anúncios novos
- **NOTF-02**: Usuário recebe alerta Slack de novos anúncios

## Out of Scope

| Feature | Reason |
|---------|--------|
| Tracking de spend/investimento real | Meta não libera dados de spend para anúncios comerciais — dados não confiáveis |
| Score baseado em performance real | App não tem acesso a métricas de performance do concorrente — score é qualidade criativa, não resultado |
| App mobile nativo | Web-first, equipe acessa via desktop |
| Real-time streaming de anúncios | Apify é batch; Ad Library não tem push API |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INF-01 | Phase 1 | Complete |
| INF-02 | Phase 1 | Complete |
| INF-03 | Phase 1 | Complete |
| INF-04 | Phase 2 | Complete |
| COL-01 | Phase 2 | Pending |
| COL-02 | Phase 2 | Pending |
| COL-03 | Phase 2 | Pending |
| COL-04 | Phase 4 | Complete |
| COL-05 | Phase 4 | Complete |
| ANA-01 | Phase 2 | Pending |
| ANA-02 | Phase 2 | Pending |
| ANA-03 | Phase 2 | Pending |
| ANA-04 | Phase 2 | Pending |
| UI-01 | Phase 3 | Complete |
| UI-02 | Phase 3 | Complete |
| UI-03 | Phase 3 | Complete |
| UI-04 | Phase 3 | Complete |
| UI-05 | Phase 3 | Complete |

**Coverage:**
- v1.1 requirements: 18 total
- Mapped to phases: 18
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-26*
*Last updated: 2026-03-26 — traceability mapped after roadmap creation*
