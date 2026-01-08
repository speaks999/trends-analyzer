-- Add authentication support - add user_id to all tables

-- Add user_id column to queries table
ALTER TABLE queries ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add user_id column to opportunity_clusters table
ALTER TABLE opportunity_clusters ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create index on user_id for queries
CREATE INDEX IF NOT EXISTS idx_queries_user_id ON queries(user_id);

-- Create index on user_id for opportunity_clusters
CREATE INDEX IF NOT EXISTS idx_opportunity_clusters_user_id ON opportunity_clusters(user_id);

-- Update RLS policies for queries
DROP POLICY IF EXISTS "Allow all operations on queries" ON queries;
CREATE POLICY "Users can view their own queries" ON queries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own queries" ON queries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own queries" ON queries FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own queries" ON queries FOR DELETE USING (auth.uid() = user_id);

-- Update RLS policies for trend_snapshots (linked to queries through foreign key)
DROP POLICY IF EXISTS "Allow all operations on trend_snapshots" ON trend_snapshots;
CREATE POLICY "Users can view trend_snapshots for their queries" ON trend_snapshots 
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM queries 
      WHERE queries.id = trend_snapshots.query_id 
      AND queries.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can insert trend_snapshots for their queries" ON trend_snapshots 
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM queries 
      WHERE queries.id = trend_snapshots.query_id 
      AND queries.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can update trend_snapshots for their queries" ON trend_snapshots 
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM queries 
      WHERE queries.id = trend_snapshots.query_id 
      AND queries.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can delete trend_snapshots for their queries" ON trend_snapshots 
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM queries 
      WHERE queries.id = trend_snapshots.query_id 
      AND queries.user_id = auth.uid()
    )
  );

-- Update RLS policies for trend_scores (linked to queries through foreign key)
DROP POLICY IF EXISTS "Allow all operations on trend_scores" ON trend_scores;
CREATE POLICY "Users can view trend_scores for their queries" ON trend_scores 
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM queries 
      WHERE queries.id = trend_scores.query_id 
      AND queries.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can insert trend_scores for their queries" ON trend_scores 
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM queries 
      WHERE queries.id = trend_scores.query_id 
      AND queries.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can update trend_scores for their queries" ON trend_scores 
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM queries 
      WHERE queries.id = trend_scores.query_id 
      AND queries.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can delete trend_scores for their queries" ON trend_scores 
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM queries 
      WHERE queries.id = trend_scores.query_id 
      AND queries.user_id = auth.uid()
    )
  );

-- Update RLS policies for intent_classifications (linked to queries through foreign key)
DROP POLICY IF EXISTS "Allow all operations on intent_classifications" ON intent_classifications;
CREATE POLICY "Users can view intent_classifications for their queries" ON intent_classifications 
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM queries 
      WHERE queries.id = intent_classifications.query_id 
      AND queries.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can insert intent_classifications for their queries" ON intent_classifications 
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM queries 
      WHERE queries.id = intent_classifications.query_id 
      AND queries.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can update intent_classifications for their queries" ON intent_classifications 
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM queries 
      WHERE queries.id = intent_classifications.query_id 
      AND queries.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can delete intent_classifications for their queries" ON intent_classifications 
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM queries 
      WHERE queries.id = intent_classifications.query_id 
      AND queries.user_id = auth.uid()
    )
  );

-- Update RLS policies for opportunity_clusters
DROP POLICY IF EXISTS "Allow all operations on opportunity_clusters" ON opportunity_clusters;
CREATE POLICY "Users can view their own clusters" ON opportunity_clusters FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own clusters" ON opportunity_clusters FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own clusters" ON opportunity_clusters FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own clusters" ON opportunity_clusters FOR DELETE USING (auth.uid() = user_id);

-- Update RLS policies for cluster_queries (linked to both clusters and queries)
DROP POLICY IF EXISTS "Allow all operations on cluster_queries" ON cluster_queries;
CREATE POLICY "Users can view cluster_queries for their data" ON cluster_queries 
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM opportunity_clusters 
      WHERE opportunity_clusters.id = cluster_queries.cluster_id 
      AND opportunity_clusters.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can insert cluster_queries for their data" ON cluster_queries 
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM opportunity_clusters 
      WHERE opportunity_clusters.id = cluster_queries.cluster_id 
      AND opportunity_clusters.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can delete cluster_queries for their data" ON cluster_queries 
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM opportunity_clusters 
      WHERE opportunity_clusters.id = cluster_queries.cluster_id 
      AND opportunity_clusters.user_id = auth.uid()
    )
  );
