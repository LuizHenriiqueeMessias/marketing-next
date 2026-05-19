# Feature Research

**Domain:** Ad Intelligence Pipeline — Competitive Ad Monitoring for Paid Media Teams
**Researched:** 2026-03-26
**Confidence:** MEDIUM-HIGH (grounded in tool comparison research and existing platform feature sets)

---

## Context

This research covers the Ad Intelligence milestone added to the existing Criativos app. The team already has: Apify-based scraping, Claude analysis, Groq Whisper transcription, OpenRouter vision, and a React dashboard. This document focuses exclusively on the new Ad Intelligence features, not what's already built.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features the paid media team will assume exist. Missing any of these makes the tool feel incomplete or untrustworthy.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Ad card list per competitor page | Core data display — the whole product is ads | LOW | Grid or table of ads, sorted by recency |
| Filter by date range | Ads from last 7/30/90 days is a standard query | LOW | Filter on `startDate` from Apify payload |
| Filter by ad format | Image vs video vs carousel affects strategy | LOW | Enum filter: image / video / carousel |
| Filter by active/inactive | Team wants to see what's still running | LOW | Field `active` from scraper output |
| Ad detail view | See full copy, creative, transcription, analysis | MEDIUM | Aggregates all analysis results in one view |
| Copy/hook display | The text of the ad is the minimum deliverable | LOW | Field `body` + `linkTitle` from scraper |
| CTA display | CTAs are a first-class analysis dimension | LOW | Field `ctaText` from scraper |
| Competitor page management | Add/remove pages being monitored | LOW | CRUD for competitor_pages table |
| Manual trigger — collect now | Team needs to pull fresh data on demand | LOW | Calls Apify actor via existing webhook pattern |
| View ad creative (image/video) | Visual is half the ad — must be viewable inline | MEDIUM | Render `images[0]` or `videos[0]` URL |
| Platform indicators | Which platforms the ad ran on (FB/IG/etc.) | LOW | Field `platforms` from scraper |
| AI analysis result display | Hook, angle, CTA, structure, score | MEDIUM | Rendered structured output from Claude |
| Video transcription display | Whisper output for video ads | MEDIUM | Same pattern as inspiration posts |

### Differentiators (Competitive Advantage)

Features that elevate the tool from "ad archive" to actual intelligence layer.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Structured AI scoring (1–10 per dimension) | Enables quick triage — team can sort by hook score rather than reading every ad | MEDIUM | Claude prompt returns JSON: `{ hook_score, angle_score, cta_score, structure_score, overall_score }` |
| Hook type classification | Identifies hook archetype (problem, result, authority, curiosity, scarcity) — enables pattern analysis across competitor ads | MEDIUM | Claude prompt output field `hook_type` |
| Ad angle tagging | Free-text + structured tag for the central angle (e.g. "price anchor", "social proof", "pain point") | MEDIUM | Claude prompt output field `angle_tag` |
| Scheduled recurring collection | Set weekly/daily collection per competitor — team doesn't need to remember to run it | MEDIUM | APScheduler or Supabase cron + pg_cron; weekly minimum per best practice |
| New ads alert / badge | Visual indicator of ads added since last visit — prevents missing new activity | LOW | `is_new` boolean set on insert, cleared on view |
| Side-by-side ad comparison | Compare two ads from same or different competitors | HIGH | Complex UI state; defer unless specifically requested |
| Competitor grouping | Group pages by brand/industry segment | LOW | Optional `group` field on competitor_pages |
| Export to CSV/JSON | Team may want to paste into slide decks or briefs | MEDIUM | Simple endpoint returning filtered query as file |
| Aggregate creative stats per competitor | "X ran 12 video ads in 30 days, avg score 7.2" — trend without reading every ad | MEDIUM | Computed aggregates at query time or materialized |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Real-time streaming collection | "I want live data" | Apify actors are batch jobs; Facebook Ad Library doesn't expose a push API. Real-time framing creates false expectations and over-engineering | Frame as "manual trigger + scheduled runs" — effectively near-real-time for a weekly team cadence |
| Estimated ad spend tracking | Seems like powerful signal | Facebook Ad Library only exposes spend ranges (not exact), and only for political/social ads in most regions. Data is unreliable for commercial ads | Display spend range as-is if available; don't build features that depend on it |
| Cross-platform ad collection (TikTok, Google) | "We also run TikTok" | Each platform requires a separate Apify actor, separate data model, separate analysis prompts. Doubles scope per platform | Ship Meta-only first; architect competitor_pages with a `platform` field to allow expansion later without a rewrite |
| Automatic creative performance scoring | "Score based on actual results" | The app has no access to competitor ad performance metrics — only the ad itself. Any "performance" score is inference, not measurement | Be explicit: scores are AI-assessed creative quality, not measured performance. Label clearly |
| Notification emails / Slack alerts | "Alert me when a competitor posts" | Adds email/Slack integration scope to a milestone that already has collection + analysis + dashboard | Ship in-app badge/indicator first. Add external notifications only if explicitly requested after launch |

---

## Feature Dependencies

```
[Competitor Page Management]
    └──required by──> [Manual Collection Trigger]
                          └──required by──> [Ad Card List]
                                                └──required by──> [Ad Detail View]

[Ad Collection]
    └──feeds──> [Video Transcription (Whisper/Groq)]
    └──feeds──> [Image Analysis (Claude Vision / OpenRouter)]
    └──feeds──> [Copy Analysis (Claude — hook, angle, CTA, score)]

[Copy Analysis]
    └──enables──> [AI Scoring Display]
    └──enables──> [Hook Type Classification]
    └──enables──> [Angle Tagging]

[Scheduled Collection]
    └──enhances──> [New Ads Badge/Alert]

[Ad Card List + Filters]
    └──required by──> [Export to CSV]
    └──required by──> [Aggregate Stats per Competitor]
```

### Dependency Notes

- **Competitor Page Management required before Collection:** Collection needs a `competitor_page_id` to know what to scrape. This is the foundation model.
- **Collection required before all Analysis:** No ads = nothing to analyze. Collection (Apify) and analysis (Claude/Whisper) are a pipeline, not independent modules.
- **Copy Analysis enables scoring display:** The AI score is a field inside the analysis result. UI can't display it until the analysis job runs and stores JSON.
- **Scheduled Collection enhances New Ads Badge:** Badge logic compares `created_at` against `last_viewed_at`. Only useful if collection runs without user action (scheduled), otherwise user already knows when they triggered it.
- **Existing Inspiracao analysis pipeline is a template:** The existing `inspiration_posts` flow (Apify → Whisper → Claude → DB → React) is the same pattern. Ad Intelligence reuses the pattern with a new table and different Claude prompt.

---

## MVP Definition

### Launch With (v1.1 core)

Minimum to make the Ad Intelligence feature usable and valuable to the team.

- [ ] Competitor page management (add/remove Meta page IDs) — without this nothing else works
- [ ] Manual collection trigger per competitor page — team can pull fresh data on demand
- [ ] Ad card list with basic filters (date range, format, active/inactive) — browse ads
- [ ] Ad detail view with creative (image/video), full copy, platform, CTA — see the full ad
- [ ] Video transcription via Groq Whisper — same capability as inspiration flow
- [ ] Claude analysis with structured output: hook text, hook type, angle tag, CTA, structure summary, score (1–10) — the core intelligence layer
- [ ] AI analysis results rendered on ad detail — so the analysis is actionable

### Add After Validation (v1.1 follow-on)

Add once core pipeline is working and team is using it daily.

- [ ] Scheduled recurring collection (weekly per competitor) — when team asks "why do I have to click every time?"
- [ ] New ads badge/indicator — when team says "I don't know what's new since last time"
- [ ] Competitor grouping — when team has 10+ pages and wants organization
- [ ] Export to CSV — when team asks to use data in reports or briefs

### Future Consideration (v2+)

Defer until the core is proven valuable.

- [ ] Side-by-side ad comparison UI — HIGH complexity, niche use case, defer
- [ ] Aggregate creative stats per competitor — requires enough data volume to be meaningful
- [ ] Cross-platform support (TikTok, Google) — separate Apify actors + data models; scope doubles per platform
- [ ] External notifications (email/Slack) — integration scope; in-app badge is sufficient at launch

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Competitor page management | HIGH | LOW | P1 |
| Manual collection trigger | HIGH | LOW | P1 |
| Ad card list + filters | HIGH | LOW | P1 |
| Ad detail view | HIGH | MEDIUM | P1 |
| Video transcription | HIGH | LOW (reuse existing) | P1 |
| Claude analysis (hook/angle/CTA/score) | HIGH | MEDIUM | P1 |
| AI score display on card/detail | HIGH | LOW | P1 |
| Scheduled collection | MEDIUM | MEDIUM | P2 |
| New ads badge | MEDIUM | LOW | P2 |
| Competitor grouping | LOW | LOW | P2 |
| Export to CSV | MEDIUM | MEDIUM | P2 |
| Aggregate stats per competitor | MEDIUM | MEDIUM | P3 |
| Side-by-side comparison | LOW | HIGH | P3 |
| Cross-platform (TikTok/Google) | MEDIUM | HIGH | P3 |

**Priority key:**
- P1: Must have for launch (v1.1 core)
- P2: Should have, add post-validation
- P3: Nice to have, future consideration

---

## Competitor Feature Analysis

Reference tools: Adligator, Panoramata, Foreplay, MagicBrief.

| Feature | Adligator | Foreplay / MagicBrief | Our Approach |
|---------|-----------|-----------------------|--------------|
| Ad collection | Proprietary crawler, continuous | Meta Ad Library + extension save | Apify actor per competitor page, on-demand + scheduled |
| Filtering | Keywords, date, format, country, CTA, page | Format, date, brand | Date range, format, active/inactive — expandable |
| AI analysis | MagicBrief: 60+ data points, score 1-4 | Foreplay: brief generation | Claude structured JSON: hook text, hook type, angle tag, CTA, structure, score 1-10 |
| Scheduling | Live trackers (persistent saved filters) | Manual save via extension | Weekly cron per competitor page; manual trigger always available |
| Alerting | New ads surface automatically in tracker | No explicit alerts | In-app badge on new ads since last visit |
| Competitor management | Page-level monitoring | Board-based organization | competitor_pages table with group field |
| Export | Download creatives | Brief export | CSV export of filtered ad list |

**Key differentiator vs commercial tools:** This is an internal tool. No per-seat pricing pressure, no generalized UX tax. Can be deeply tailored to how this specific team uses data — tighter prompts, team-specific angle taxonomy, integrated with existing inspiration workflow.

---

## Apify Data Fields Available

From the `apify/facebook-ads-scraper` actor output (MEDIUM confidence — from community documentation):

| Field | Description | Used For |
|-------|-------------|----------|
| `libraryID` | Meta ad library unique ID | Deduplication, permalink |
| `brand` | Advertiser name | Display |
| `active` | Boolean — still running | Filter |
| `platforms` | Array: Facebook, Instagram, etc. | Display, filter |
| `body` | Main ad copy text | Analysis input |
| `linkTitle` | Headline text | Analysis input |
| `linkDescription` | Description below headline | Analysis input |
| `ctaText` | CTA button text | Analysis input |
| `ctaUrl` | CTA destination URL | Display |
| `images` | Array of image URLs | Creative display |
| `videos` | Array with URL + duration | Creative display, transcription |
| `startDate` | When ad started running | Date filter, sorting |
| `format` | image / video / carousel | Format filter |
| `similarAdCount` | Number of ad variants | Display context |
| `spend` / `impressions` | Ranges when available | Display only (unreliable) |

Input parameters for collection: page URL or page ID, country, date range, active status filter, max results.

---

## Sources

- [12 Best Facebook Ads Spy Tools for 2026](https://proven-saas.com/blog/12-best-facebook-ads-spy-tools-for-2026-find-winning-ads)
- [Panoramata vs Foreplay vs Adligator Comparison (2026)](https://adligator.com/blog/panoramata-vs-foreplay-vs-adligator)
- [Foreplay vs MagicBrief: 2026 Comparison](https://admanage.ai/blog/foreplay-vs-magicbrief)
- [Facebook Ads Library API: Advanced Competitive Research (2026)](https://deepsolv.ai/blog/facebook-ads-library-api-how-to-use-it-for-advanced-competitive-research-2026-update)
- [9 Best Facebook Ads Intelligence Platforms 2026](https://www.adstellar.ai/blog/facebook-ads-intelligence-platform)
- [Apify Facebook Ads Scraper](https://apify.com/apify/facebook-ads-scraper)
- [Best AI Ad Creative Analysis Tools](https://segwise.ai/blog/ai-ad-creative-analysis-tools)
- [Ad Hooks That Scale — Angle and Hook Framework](https://billo.app/blog/ad-hooks-variations/)
- [21 Best Ad Intelligence Software Reviewed For 2026](https://thecmo.com/tools/best-ad-intelligence-software/)

---
*Feature research for: Ad Intelligence Pipeline — Criativos v1.1*
*Researched: 2026-03-26*
