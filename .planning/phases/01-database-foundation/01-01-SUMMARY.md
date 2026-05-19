---
phase: 01-database-foundation
plan: "01"
subsystem: database
tags: [supabase, postgresql, rls, migrations, schema, storage]
dependency_graph:
  requires: []
  provides:
    - ad_competitors table with RLS
    - ad_collection_runs table with RLS
    - ad_creatives table with RLS
    - ad_analyses table with RLS
    - ad-media storage bucket policies
  affects:
    - Phase 02 (collection pipeline reads/writes these tables)
    - Phase 03 (frontend queries these tables directly)
tech_stack:
  added: []
  patterns:
    - "Supabase RLS: ALTER TABLE ENABLE ROW LEVEL SECURITY + 5 policies (4 authenticated + service_role)"
    - "Partial unique index on nullable dedup key: CREATE UNIQUE INDEX ... WHERE ad_id IS NOT NULL"
    - "FK dependency order: ad_competitors -> ad_collection_runs -> ad_creatives -> ad_analyses"
key_files:
  created:
    - "Fluxos em Python/criativos-standalone/supabase/migrations/20260326_ad_intelligence.sql"
  modified: []
decisions:
  - "Used 5 policies per table (4 authenticated + service_role) matching 00_full_schema.sql canonical pattern"
  - "Storage RLS policies included in SQL migration; bucket creation remains a manual Dashboard step"
  - "Partial unique index on ad_creatives(ad_id) WHERE ad_id IS NOT NULL handles nullable dedup key"
requirements-completed: [INF-01, INF-02, INF-03, INF-04]
metrics:
  duration: "~20 minutes"
  completed_date: "2026-03-26"
  tasks_completed: 2
  tasks_total: 2
  files_created: 1
  files_modified: 0
---

# Phase 01 Plan 01: Ad Intelligence Database Schema Summary

## One-liner

Four-table Supabase schema (ad_competitors, ad_collection_runs, ad_creatives, ad_analyses) with RLS, 6 indexes including partial unique dedup, and storage.objects policies for the ad-media bucket.

## What Was Built

Task 1 created the complete SQL migration file `20260326_ad_intelligence.sql` with:

- **4 tables** in FK dependency order: `ad_competitors` -> `ad_collection_runs` -> `ad_creatives` -> `ad_analyses`
- **RLS on all tables**: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` immediately after each `CREATE TABLE`
- **20 table policies**: 5 per table (SELECT/INSERT/UPDATE/DELETE for authenticated + ALL for service_role)
- **6 indexes**: 1 partial unique index on `ad_creatives(ad_id) WHERE ad_id IS NOT NULL` + 5 regular FK/filter indexes
- **3 storage.objects policies**: authenticated read, authenticated upload, service_role full access for `bucket_id = 'ad-media'`
- All locked decisions satisfied: D-01 through D-06, INF-01 through INF-04

## Status

- Task 1: COMPLETE (committed cb93c1d)
- Task 2: COMPLETE — migration executed on Supabase Dashboard, all 4 tables verified with RLS policies, `ad-media` private Storage bucket created and verified (checkpoint:human-verify approved by user)

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — this is a pure SQL migration file. No application code, no placeholder data.

## Self-Check

- [x] Migration file exists at `Fluxos em Python/criativos-standalone/supabase/migrations/20260326_ad_intelligence.sql`
- [x] File contains exactly 4 `CREATE TABLE IF NOT EXISTS` statements
- [x] Table order: ad_competitors (line 16) -> ad_collection_runs (line 42) -> ad_creatives (line 69) -> ad_analyses (line 107)
- [x] `raw_apify_data jsonb` present in ad_creatives (INF-02)
- [x] `storage_image_path text` and `storage_video_path text` present in ad_creatives (D-02)
- [x] `file_size_bytes bigint` present in ad_creatives (INF-04)
- [x] `grupo text` present in ad_competitors (D-04)
- [x] `creative_id uuid NOT NULL UNIQUE REFERENCES ad_creatives(id)` in ad_analyses (D-06)
- [x] `needs_reanalysis boolean` and `prompt_version text` in ad_analyses (D-05)
- [x] 4x `ENABLE ROW LEVEL SECURITY`
- [x] 23 total `CREATE POLICY` statements (20 table + 3 storage)
- [x] `idx_ad_creatives_ad_id` with `WHERE ad_id IS NOT NULL`
- [x] 6 `CREATE INDEX IF NOT EXISTS` / `CREATE UNIQUE INDEX IF NOT EXISTS`
- [x] `storage.objects` policies for `bucket_id = 'ad-media'`
- [x] Commit cb93c1d exists in git log

## Self-Check: PASSED
