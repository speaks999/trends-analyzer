-- Add ad traffic metrics to ads_keyword_metrics table
-- These fields come from DataForSEO's Ad Traffic by Keywords endpoint
-- which provides more accurate commercial intent data than search volume alone

ALTER TABLE ads_keyword_metrics
  ADD COLUMN IF NOT EXISTS ad_impressions INTEGER,
  ADD COLUMN IF NOT EXISTS clicks INTEGER,
  ADD COLUMN IF NOT EXISTS ctr NUMERIC(5, 4), -- Click-through rate (0-1, e.g., 0.0234 = 2.34%)
  ADD COLUMN IF NOT EXISTS avg_cpc_micros BIGINT; -- Average cost per click in micros (1 USD = 1,000,000 micros)

COMMENT ON COLUMN ads_keyword_metrics.ad_impressions IS 'Number of ad impressions (more accurate than search volume)';
COMMENT ON COLUMN ads_keyword_metrics.clicks IS 'Estimated clicks from targeting this keyword';
COMMENT ON COLUMN ads_keyword_metrics.ctr IS 'Click-through rate (0-1)';
COMMENT ON COLUMN ads_keyword_metrics.avg_cpc_micros IS 'Average cost per click historically paid (in micros)';
