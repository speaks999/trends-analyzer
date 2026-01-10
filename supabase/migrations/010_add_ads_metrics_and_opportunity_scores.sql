-- Add Google Ads keyword metrics + opportunity scoring outputs
-- This enables absolute demand (search volume) and AdWords cost proxies (top-of-page bids).

-- =====================================================================
-- Table: ads_keyword_metrics
-- Stores latest Google Ads Keyword Planner historical metrics per query/targeting tuple.
-- =====================================================================

CREATE TABLE IF NOT EXISTS ads_keyword_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_id UUID NOT NULL REFERENCES queries(id) ON DELETE CASCADE,
  geo TEXT NOT NULL DEFAULT 'US',
  language_code TEXT NOT NULL DEFAULT 'en',
  network TEXT NOT NULL DEFAULT 'GOOGLE_SEARCH',
  currency_code TEXT NOT NULL DEFAULT 'USD',

  avg_monthly_searches INTEGER,
  competition TEXT CHECK (competition IN ('LOW', 'MEDIUM', 'HIGH')),
  competition_index INTEGER CHECK (competition_index >= 0 AND competition_index <= 100),
  top_of_page_bid_low_micros BIGINT,
  top_of_page_bid_high_micros BIGINT,

  raw JSONB,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (query_id, geo, language_code, network)
);

CREATE INDEX IF NOT EXISTS idx_ads_keyword_metrics_query_id ON ads_keyword_metrics(query_id);
CREATE INDEX IF NOT EXISTS idx_ads_keyword_metrics_fetched_at ON ads_keyword_metrics(fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_ads_keyword_metrics_targeting ON ads_keyword_metrics(geo, language_code, network);

ALTER TABLE ads_keyword_metrics ENABLE ROW LEVEL SECURITY;

-- RLS policies: access is allowed only if the underlying query belongs to auth.uid().
DROP POLICY IF EXISTS "Users can view ads_keyword_metrics for their queries" ON ads_keyword_metrics;
DROP POLICY IF EXISTS "Users can insert ads_keyword_metrics for their queries" ON ads_keyword_metrics;
DROP POLICY IF EXISTS "Users can update ads_keyword_metrics for their queries" ON ads_keyword_metrics;
DROP POLICY IF EXISTS "Users can delete ads_keyword_metrics for their queries" ON ads_keyword_metrics;

CREATE POLICY "Users can view ads_keyword_metrics for their queries" ON ads_keyword_metrics
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM queries
      WHERE queries.id = ads_keyword_metrics.query_id
      AND queries.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert ads_keyword_metrics for their queries" ON ads_keyword_metrics
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM queries
      WHERE queries.id = ads_keyword_metrics.query_id
      AND queries.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update ads_keyword_metrics for their queries" ON ads_keyword_metrics
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM queries
      WHERE queries.id = ads_keyword_metrics.query_id
      AND queries.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete ads_keyword_metrics for their queries" ON ads_keyword_metrics
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM queries
      WHERE queries.id = ads_keyword_metrics.query_id
      AND queries.user_id = auth.uid()
    )
  );

-- =====================================================================
-- Table: opportunity_scores
-- Stores computed opportunity scores per query/targeting tuple.
-- Note: This is separate from trend_scores (TOS / momentum score).
-- =====================================================================

CREATE TABLE IF NOT EXISTS opportunity_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_id UUID NOT NULL REFERENCES queries(id) ON DELETE CASCADE,

  geo TEXT NOT NULL DEFAULT 'US',
  language_code TEXT NOT NULL DEFAULT 'en',
  network TEXT NOT NULL DEFAULT 'GOOGLE_SEARCH',
  "window" TEXT NOT NULL DEFAULT '90d',

  opportunity_score NUMERIC(5, 2) NOT NULL CHECK (opportunity_score >= 0 AND opportunity_score <= 100),
  efficiency_score NUMERIC(5, 2) NOT NULL CHECK (efficiency_score >= 0 AND efficiency_score <= 100),

  demand_score NUMERIC(5, 2) NOT NULL CHECK (demand_score >= 0 AND demand_score <= 100),
  momentum_score NUMERIC(5, 2) NOT NULL CHECK (momentum_score >= 0 AND momentum_score <= 100),
  cpc_score NUMERIC(5, 2) NOT NULL CHECK (cpc_score >= 0 AND cpc_score <= 100),

  -- Explainability: reuse momentum sub-metrics
  slope NUMERIC(10, 4) NOT NULL,
  acceleration NUMERIC(10, 4) NOT NULL,
  consistency NUMERIC(10, 4) NOT NULL,

  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (query_id, geo, language_code, network, "window")
);

CREATE INDEX IF NOT EXISTS idx_opportunity_scores_query_id ON opportunity_scores(query_id);
CREATE INDEX IF NOT EXISTS idx_opportunity_scores_score ON opportunity_scores(opportunity_score DESC);
CREATE INDEX IF NOT EXISTS idx_opportunity_scores_calculated_at ON opportunity_scores(calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_opportunity_scores_targeting ON opportunity_scores(geo, language_code, network, "window");

ALTER TABLE opportunity_scores ENABLE ROW LEVEL SECURITY;

-- RLS policies: access is allowed only if the underlying query belongs to auth.uid().
DROP POLICY IF EXISTS "Users can view opportunity_scores for their queries" ON opportunity_scores;
DROP POLICY IF EXISTS "Users can insert opportunity_scores for their queries" ON opportunity_scores;
DROP POLICY IF EXISTS "Users can update opportunity_scores for their queries" ON opportunity_scores;
DROP POLICY IF EXISTS "Users can delete opportunity_scores for their queries" ON opportunity_scores;

CREATE POLICY "Users can view opportunity_scores for their queries" ON opportunity_scores
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM queries
      WHERE queries.id = opportunity_scores.query_id
      AND queries.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert opportunity_scores for their queries" ON opportunity_scores
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM queries
      WHERE queries.id = opportunity_scores.query_id
      AND queries.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update opportunity_scores for their queries" ON opportunity_scores
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM queries
      WHERE queries.id = opportunity_scores.query_id
      AND queries.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete opportunity_scores for their queries" ON opportunity_scores
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM queries
      WHERE queries.id = opportunity_scores.query_id
      AND queries.user_id = auth.uid()
    )
  );

