---
phase: 1
slug: database-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-26
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | SQL verification via Supabase REST API (no test framework — infrastructure phase) |
| **Config file** | none — SQL migrations run directly on Supabase |
| **Quick run command** | `curl -s "${SUPABASE_URL}/rest/v1/ad_competitors?select=id&limit=1" -H "apikey: ${SUPABASE_ANON}" -H "Authorization: Bearer ${SUPABASE_ANON}"` |
| **Full suite command** | Run all table existence checks + RLS policy verification |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Verify table exists via REST API
- **After every plan wave:** Run full RLS verification
- **Before `/gsd:verify-work`:** All tables, RLS policies, Storage bucket confirmed
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | INF-01 | integration | REST API query to each table | N/A (SQL) | pending |
| 1-01-02 | 01 | 1 | INF-02 | integration | Check raw_apify_data column exists | N/A (SQL) | pending |
| 1-01-03 | 01 | 1 | INF-03 | manual | Verify Storage bucket via Dashboard | N/A | pending |
| 1-01-04 | 01 | 1 | INF-04 | integration | Check file_size_bytes column exists in ad_creatives | N/A (SQL) | pending |

*Status: pending*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No test framework installation needed — this phase is pure SQL migrations and Supabase configuration.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Supabase Storage bucket exists | INF-03 | Bucket creation via Dashboard/API, not SQL | Go to Supabase Dashboard > Storage, verify `ad-media` bucket exists with private access |
| RLS blocks anon access | INF-01 | Needs live Supabase instance | Query tables with anon key, verify empty result or 403 |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
