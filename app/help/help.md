# Help: Entrepreneur Demand & Trend Intelligence

This app helps you discover **entrepreneur-relevant search phrases**, compare **trend momentum**, and (when configured) pull **keyword metrics** like **monthly searches** and **top-of-page bids (CPC proxy)** to estimate commercial value.

---

## Quick start (in the UI)

1. **Add queries**
   - Use the "Manage Search Queries" box to add phrases you care about (ex: "cash flow problems", "sales follow up").
   - You can also generate ideas with **AI Query Suggestions**.

2. **Compare trends**
   - Click **"Compare Term Trends"** to fetch historical search volume from DataForSEO and visualize trends over time.

3. **Compute Opportunity (volume + CPC + momentum)**
   - Click **"💰 Opportunity"** inside the Trends screen.
   - This will:
     - Fetch keyword metrics (search volume, CPC, competition) for your tracked queries via DataForSEO
     - Compute **Opportunity Score** and **Efficiency Score**

---

## What the scores mean

### Opportunity (v2)
Opportunity combines:
- **Demand** (avg monthly searches from DataForSEO)
- **Momentum** (trend growth based on slope, acceleration, and consistency)
- **CPC** (top-of-page bid from DataForSEO, used as a commercial-intent proxy)

You'll see:
- **Opportunity**: higher = bigger + growing + valuable
- **Efficiency**: higher = bigger + growing but *less* expensive to buy traffic for

> Note: Bids are shown in *micros* in the API. The UI renders bids in currency using bid/1,000,000.

---

## Data sources (what's "real" vs inferred)

### Historical Search Volume (DataForSEO API)
- Provides **actual** monthly search volumes (not normalized).
- Used for trend charts to show real search volume over time.

### SERP Data (DataForSEO API)
- **Related searches** (shown as "Related Topics" in the UI)
- **People Also Ask** questions

### Keyword Metrics (DataForSEO API)
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
- `supabase/migrations/011_add_ad_traffic_metrics.sql`  ✅ (required for ad traffic metrics)

### 2) OpenAI (optional; for AI suggestions + intent classification)
Set:
- `OPENAI_API_KEY`

### 3) DataForSEO (required for trends, CPC + monthly searches, and SERP data)
Set these **server-side env vars**:
- `DATAFORSEO_LOGIN` (your DataForSEO account email)
- `DATAFORSEO_PASSWORD` (your DataForSEO API password)

Optional:
- `DATAFORSEO_API_VERSION` (defaults to `v3`)

If DataForSEO isn't configured, clicking **💰 Opportunity** will show a clear config error.

---

## Troubleshooting

### "No trend data available"
- Your query is likely too niche. Try broader phrasing.
- Ensure DataForSEO is properly configured with valid credentials.

### "User must be authenticated"
- You need to sign in. Data is scoped per user with RLS policies in Supabase.

### "DataForSEO API is not configured"
- Add the required `DATAFORSEO_LOGIN` and `DATAFORSEO_PASSWORD` environment variables and redeploy/restart.
- Sign up at https://dataforseo.com/ if you don't have an account yet.

---

## Limitations / interpretation notes

- This app can't literally detect "queries used by entrepreneurs" as a demographic slice. It can help identify **entrepreneur-intent keywords** and measure:
  - momentum (Trends),
  - commercial intent proxies (CPC/top-of-page bids),
  - and demand (monthly searches).
