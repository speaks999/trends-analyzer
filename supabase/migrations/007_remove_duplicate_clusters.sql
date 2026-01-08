-- Migration to remove duplicate clusters
-- This removes:
-- 1. Empty clusters (clusters with no associated queries)
-- 2. Duplicate clusters with identical query sets (keeps the most recent one)

-- Step 1: Remove empty clusters (clusters with no queries)
DELETE FROM opportunity_clusters
WHERE id IN (
  SELECT oc.id
  FROM opportunity_clusters oc
  LEFT JOIN cluster_queries cq ON oc.id = cq.cluster_id
  WHERE cq.cluster_id IS NULL
);

-- Step 2: Remove duplicate clusters with identical query sets
-- For each set of query IDs, keep only the most recent cluster (by created_at)
WITH cluster_query_sets AS (
  SELECT 
    oc.id,
    oc.user_id,
    oc.created_at,
    ARRAY_AGG(cq.query_id ORDER BY cq.query_id) as query_ids
  FROM opportunity_clusters oc
  INNER JOIN cluster_queries cq ON oc.id = cq.cluster_id
  GROUP BY oc.id, oc.user_id, oc.created_at
),
ranked_clusters AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, query_ids 
      ORDER BY created_at DESC
    ) as rn
  FROM cluster_query_sets
)
DELETE FROM opportunity_clusters
WHERE id IN (
  SELECT id FROM ranked_clusters WHERE rn > 1
);

-- Log how many clusters remain
DO $$
DECLARE
  remaining_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO remaining_count FROM opportunity_clusters;
  RAISE NOTICE 'Remaining clusters after deduplication: %', remaining_count;
END $$;
