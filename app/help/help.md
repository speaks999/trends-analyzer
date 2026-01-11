# Help: Entrepreneur Demand & Trend Intelligence

This app helps you discover **entrepreneur-relevant search phrases**, compare **trend momentum**, and (when configured) pull **Google Ads Keyword Planner metrics** like **monthly searches** and **top-of-page bids (CPC proxy)** to estimate commercial value.

---

## Quick start (in the UI)

1. **Add queries**
   - Use the “Manage Search Queries” box to add phrases you care about (ex: “cash flow problems”, “sales follow up”).
   - You can also generate ideas with **AI Query Suggestions**.

2. **Compare trends**
   - Click **“Compare Term Trends”** to fetch Google Trends time series and compute **TOS (Trend Opportunity Score)**.

3. **Compute Opportunity (volume + CPC + momentum)**
   - Click **“💰 Opportunity”** inside the Trends screen.
   - This will:
     - Fetch Google Ads metrics for your tracked queries
     - Compute **Opportunity Score** and **Efficiency Score**

---

## What the scores mean

### TOS (Trend Opportunity Score)
TOS is a **momentum-only** score based on the last 90 days of interest-over-time data:
- **Slope**: are searches increasing?
- **Acceleration**: is growth speeding up?
- **Consistency**: is growth steady vs spiky?

These sub-metrics are computed on a 0–25 scale and then rescaled into a **0–100** TOS.

### Opportunity (v2)
Opportunity combines:
- **Demand** (Google Ads avg monthly searches)
- **Momentum** (TOS)
- **CPC** (Google Ads top-of-page bid, used as a commercial-intent proxy)

You’ll see:
- **Opportunity**: higher = bigger + growing + valuable
- **Efficiency**: higher = bigger + growing but *less* expensive to buy traffic for

> Note: Google Ads bids are shown in *micros* in the API. The UI renders bids in currency using bid/1,000,000.

---

## Data sources (what’s “real” vs inferred)

### Google Trends (via SerpApi)
- Provides **normalized** interest (0–100).
- Values are **relative**, not absolute search volume.

### Google Search expansions (via SerpApi)
- **Related searches** (shown as “Related Queries” in the UI)
- **Related Questions / People Also Ask**

### Google Ads Keyword Planner (Google Ads API)
When configured, this provides:
- **Avg monthly searches**
- **Competition** (+ competition index when available)
- **Top-of-page bid low/high** (useful CPC proxy)

---

## Setup required (production or full-feature local)

### 1) Supabase
You must run migrations in your Supabase project:
- `supabase/migrations/001_initial_schema.sql`
- `supabase/migrations/002_add_authentication.sql`
- `supabase/migrations/003_add_intent_data.sql`
- `supabase/migrations/009_rename_paa_to_related_questions.sql`
- `supabase/migrations/010_add_ads_metrics_and_opportunity_scores.sql`  ✅ (required for v2 opportunity)

### 2) SerpApi (for Trends + related queries/questions)
Set:
- `SERPAPI_API_KEY`

### 3) OpenAI (optional; for AI suggestions + intent classification)
Set:
- `OPENAI_API_KEY`

### 4) Google Ads (required for CPC + monthly searches)
Set these **server-side env vars**:
- `GOOGLE_ADS_DEVELOPER_TOKEN`
- `GOOGLE_ADS_CUSTOMER_ID` (digits only)
- `GOOGLE_ADS_CLIENT_ID`
- `GOOGLE_ADS_CLIENT_SECRET`
- `GOOGLE_ADS_REFRESH_TOKEN`

Optional:
- `GOOGLE_ADS_LOGIN_CUSTOMER_ID` (manager account CID)
- `GOOGLE_ADS_API_VERSION` (defaults to `v16`)

If Google Ads isn’t configured, clicking **💰 Opportunity** will show a clear config error.

---

## Troubleshooting

### “Google Trends returned no data”
- Your query is likely too niche. Try broader phrasing.
- Try removing very long phrases; Google Trends works best on shorter keywords.

### “User must be authenticated”
- You need to sign in. Data is scoped per user with RLS policies in Supabase.

### “Google Ads API is not configured”
- Add the required `GOOGLE_ADS_*` environment variables and redeploy/restart.

---

## Limitations / interpretation notes

- This app can’t literally detect “queries used by entrepreneurs” as a demographic slice. It can help identify **entrepreneur-intent keywords** and measure:
  - momentum (Trends),
  - commercial intent proxies (CPC/top-of-page bids),
  - and demand (monthly searches).

