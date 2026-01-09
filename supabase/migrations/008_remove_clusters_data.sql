-- Migration to remove all cluster data since clusters are no longer used
-- This cleans up the database after eliminating the clusters feature

-- Step 1: Delete all cluster_queries relationships
DELETE FROM cluster_queries;

-- Step 2: Delete all opportunity_clusters
DELETE FROM opportunity_clusters;

-- Log the cleanup
DO $$
DECLARE
  remaining_clusters INTEGER;
  remaining_cluster_queries INTEGER;
BEGIN
  SELECT COUNT(*) INTO remaining_clusters FROM opportunity_clusters;
  SELECT COUNT(*) INTO remaining_cluster_queries FROM cluster_queries;
  RAISE NOTICE 'Cluster cleanup complete. Remaining clusters: %, Remaining cluster_queries: %', remaining_clusters, remaining_cluster_queries;
END $$;

-- Note: We're keeping the tables for now in case we need to rollback
-- If you want to completely remove the tables, uncomment the following:
-- DROP TABLE IF EXISTS cluster_queries CASCADE;
-- DROP TABLE IF EXISTS opportunity_clusters CASCADE;
