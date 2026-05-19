---
phase: 3
slug: ad-intelligence-dashboard
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-26
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual browser verification + grep checks on source files |
| **Config file** | none — no test framework for this frontend phase |
| **Quick run command** | `grep -r "from.*supabase" frontend/src/pages/AdIntelligence/ --include="*.tsx"` |
| **Full suite command** | Build check: `cd frontend && npm run build` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Verify file exists and contains key patterns via grep
- **After every plan wave:** Run `npm run build` to catch TypeScript/import errors
- **Before `/gsd:verify-work`:** Full build + manual browser verification
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 3-01-01 | 01 | 1 | UI-01 | build | `npm run build` | TBD | pending |
| 3-02-01 | 02 | 2 | UI-02 | build | `npm run build` | TBD | pending |
| 3-03-01 | 03 | 2 | UI-03 | build | `npm run build` | TBD | pending |
| 3-04-01 | 04 | 2 | UI-04 | build | `npm run build` | TBD | pending |
| 3-05-01 | 05 | 2 | UI-05 | manual | Browser check | TBD | pending |

*Status: pending*

---

## Wave 0 Requirements

- [ ] `frontend/src/pages/AdIntelligence/types.ts` — Type definitions for ad_competitors, ad_creatives, ad_analyses
- [ ] `VITE_API_URL` env var added to `.env.example`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Filters update cards in real-time | UI-01 | Visual interaction test | Apply each filter, verify card list updates immediately |
| Video plays inline in detail | UI-02 | Browser media test | Open video ad detail, verify video plays |
| CSV downloads with correct data | UI-03 | File download test | Apply filters, click export, open CSV, verify content matches |
| View toggle cards/table works | UI-01 | Visual test | Toggle between views, verify data consistency |
| Fallback for missing analysis | UI-05 | Visual test | Find ad without analysis, verify no "undefined" shown |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
