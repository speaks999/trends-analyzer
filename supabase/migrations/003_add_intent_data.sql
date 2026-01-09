-- Add intent data tables for related topics and PAA

-- Create related_topics table
CREATE TABLE IF NOT EXISTS related_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_id UUID NOT NULL REFERENCES queries(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  value NUMERIC(10, 2) NOT NULL,
  is_rising BOOLEAN NOT NULL DEFAULT false,
  link TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(query_id, topic)
);

-- Create index on related_topics
CREATE INDEX IF NOT EXISTS idx_related_topics_query_id ON related_topics(query_id);
CREATE INDEX IF NOT EXISTS idx_related_topics_is_rising ON related_topics(is_rising);

-- Create people_also_ask table
CREATE TABLE IF NOT EXISTS people_also_ask (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_id UUID NOT NULL REFERENCES queries(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT,
  snippet TEXT,
  title TEXT,
  link TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(query_id, question)
);

-- Create index on people_also_ask
CREATE INDEX IF NOT EXISTS idx_people_also_ask_query_id ON people_also_ask(query_id);

-- Add intent_subcategory to intent_classifications table
ALTER TABLE intent_classifications ADD COLUMN IF NOT EXISTS subcategory TEXT;

-- Add related_topics JSONB column to opportunity_clusters
ALTER TABLE opportunity_clusters ADD COLUMN IF NOT EXISTS related_topics JSONB;

-- Add paa_questions JSONB column to opportunity_clusters
ALTER TABLE opportunity_clusters ADD COLUMN IF NOT EXISTS paa_questions JSONB;

-- Enable Row Level Security for new tables
ALTER TABLE related_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE people_also_ask ENABLE ROW LEVEL SECURITY;

-- Create policies for related_topics (linked to queries through foreign key)
CREATE POLICY "Users can view related_topics for their queries" ON related_topics 
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM queries 
      WHERE queries.id = related_topics.query_id 
      AND queries.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can insert related_topics for their queries" ON related_topics 
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM queries 
      WHERE queries.id = related_topics.query_id 
      AND queries.user_id = auth.uid()
    )
  );

-- Create policies for people_also_ask (linked to queries through foreign key)
CREATE POLICY "Users can view people_also_ask for their queries" ON people_also_ask 
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM queries 
      WHERE queries.id = people_also_ask.query_id 
      AND queries.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can insert people_also_ask for their queries" ON people_also_ask 
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM queries 
      WHERE queries.id = people_also_ask.query_id 
      AND queries.user_id = auth.uid()
    )
  );
