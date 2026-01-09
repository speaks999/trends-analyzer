-- Migration: Rename people_also_ask to related_questions
-- This migration renames the table and adds a source_logo column
-- for the Google Related Questions API

-- Step 1: Add source_logo column if it doesn't exist
ALTER TABLE people_also_ask ADD COLUMN IF NOT EXISTS source_logo TEXT;

-- Step 2: Rename the table
ALTER TABLE people_also_ask RENAME TO related_questions;

-- Step 3: Rename the index
DROP INDEX IF EXISTS idx_people_also_ask_query_id;
CREATE INDEX IF NOT EXISTS idx_related_questions_query_id ON related_questions(query_id);

-- Step 4: Update RLS policies (drop old ones, create new ones)
DROP POLICY IF EXISTS "Users can view people_also_ask for their queries" ON related_questions;
DROP POLICY IF EXISTS "Users can insert people_also_ask for their queries" ON related_questions;

CREATE POLICY "Users can view related_questions for their queries" ON related_questions
  FOR SELECT
  USING (
    query_id IN (
      SELECT queries.id FROM queries
      WHERE queries.id = related_questions.query_id
      AND queries.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert related_questions for their queries" ON related_questions
  FOR INSERT
  WITH CHECK (
    query_id IN (
      SELECT queries.id FROM queries
      WHERE queries.id = related_questions.query_id
      AND queries.user_id = auth.uid()
    )
  );

-- Step 5: Add delete policy for cleanup
CREATE POLICY "Users can delete related_questions for their queries" ON related_questions
  FOR DELETE
  USING (
    query_id IN (
      SELECT queries.id FROM queries
      WHERE queries.id = related_questions.query_id
      AND queries.user_id = auth.uid()
    )
  );
