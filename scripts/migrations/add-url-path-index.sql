-- Migration: Add index on url_path for app_url_classifications
-- Purpose: Speed up NOT EXISTS lookups in the unclassified URLs query
-- The url_path column already has a UNIQUE constraint, but this ensures
-- the index is explicitly available for anti-join queries.

-- Check if index already exists (from the UNIQUE constraint)
-- If not, create it explicitly:
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_url_classifications_url_path
  ON app_url_classifications(url_path);
