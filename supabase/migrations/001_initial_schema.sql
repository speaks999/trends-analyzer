-- Create queries table
CREATE TABLE IF NOT EXISTS queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text TEXT NOT NULL,
  template TEXT,
  stage TEXT,
  "function" TEXT,
  pain TEXT,
  asset TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(text)
);

-- Create index on text for faster lookups
CREATE INDEX IF NOT EXISTS idx_queries_text ON queries(text);
CREATE INDEX IF NOT EXISTS idx_queries_created_at ON queries(created_at);

-- Create trend_snapshots table
CREATE TABLE IF NOT EXISTS trend_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_id UUID NOT NULL REFERENCES queries(id) ON DELETE CASCADE,
  date TIMESTAMPTZ NOT NULL,
  interest_value NUMERIC(10, 2) NOT NULL,
  region TEXT,
  "window" TEXT NOT NULL CHECK ("window" IN ('30d', '90d', '12m')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(query_id, date, region, "window")
);

-- Create indexes for trend_snapshots
CREATE INDEX IF NOT EXISTS idx_trend_snapshots_query_id ON trend_snapshots(query_id);
CREATE INDEX IF NOT EXISTS idx_trend_snapshots_date ON trend_snapshots(date);
CREATE INDEX IF NOT EXISTS idx_trend_snapshots_window ON trend_snapshots("window");
CREATE INDEX IF NOT EXISTS idx_trend_snapshots_query_window ON trend_snapshots(query_id, "window");

-- Create trend_scores table
CREATE TABLE IF NOT EXISTS trend_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_id UUID NOT NULL REFERENCES queries(id) ON DELETE CASCADE,
  score NUMERIC(5, 2) NOT NULL CHECK (score >= 0 AND score <= 100),
  slope NUMERIC(10, 4) NOT NULL,
  acceleration NUMERIC(10, 4) NOT NULL,
  consistency NUMERIC(10, 4) NOT NULL,
  breadth NUMERIC(10, 4) NOT NULL,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(query_id)
);

-- Create index on trend_scores
CREATE INDEX IF NOT EXISTS idx_trend_scores_query_id ON trend_scores(query_id);
CREATE INDEX IF NOT EXISTS idx_trend_scores_score ON trend_scores(score DESC);
CREATE INDEX IF NOT EXISTS idx_trend_scores_calculated_at ON trend_scores(calculated_at DESC);

-- Create intent_classifications table
CREATE TABLE IF NOT EXISTS intent_classifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_id UUID NOT NULL REFERENCES queries(id) ON DELETE CASCADE,
  intent_type TEXT NOT NULL CHECK (intent_type IN ('pain', 'tool', 'transition', 'education')),
  confidence NUMERIC(5, 2) NOT NULL CHECK (confidence >= 0 AND confidence <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(query_id)
);

-- Create index on intent_classifications
CREATE INDEX IF NOT EXISTS idx_intent_classifications_query_id ON intent_classifications(query_id);
CREATE INDEX IF NOT EXISTS idx_intent_classifications_intent_type ON intent_classifications(intent_type);

-- Create opportunity_clusters table
CREATE TABLE IF NOT EXISTS opportunity_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  intent_type TEXT NOT NULL CHECK (intent_type IN ('pain', 'tool', 'transition', 'education')),
  average_score NUMERIC(5, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index on opportunity_clusters
CREATE INDEX IF NOT EXISTS idx_opportunity_clusters_intent_type ON opportunity_clusters(intent_type);
CREATE INDEX IF NOT EXISTS idx_opportunity_clusters_average_score ON opportunity_clusters(average_score DESC);

-- Create junction table for cluster-queries relationship
CREATE TABLE IF NOT EXISTS cluster_queries (
  cluster_id UUID NOT NULL REFERENCES opportunity_clusters(id) ON DELETE CASCADE,
  query_id UUID NOT NULL REFERENCES queries(id) ON DELETE CASCADE,
  PRIMARY KEY (cluster_id, query_id)
);

-- Create indexes on cluster_queries
CREATE INDEX IF NOT EXISTS idx_cluster_queries_cluster_id ON cluster_queries(cluster_id);
CREATE INDEX IF NOT EXISTS idx_cluster_queries_query_id ON cluster_queries(query_id);

-- Enable Row Level Security (RLS) - we'll make all tables public for now
-- You can add RLS policies later for authentication
ALTER TABLE queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE trend_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE trend_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE intent_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunity_clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE cluster_queries ENABLE ROW LEVEL SECURITY;

-- Create policies to allow all operations (adjust based on your auth needs)
CREATE POLICY "Allow all operations on queries" ON queries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on trend_snapshots" ON trend_snapshots FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on trend_scores" ON trend_scores FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on intent_classifications" ON intent_classifications FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on opportunity_clusters" ON opportunity_clusters FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on cluster_queries" ON cluster_queries FOR ALL USING (true) WITH CHECK (true);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for opportunity_clusters
CREATE TRIGGER update_opportunity_clusters_updated_at
  BEFORE UPDATE ON opportunity_clusters
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
