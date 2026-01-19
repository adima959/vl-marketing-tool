-- ============================================================================
-- REFRESH merged_ads_spending MATERIALIZED VIEW
-- ============================================================================
-- Run this script whenever you want to update the view with new data
-- Recommended: Set up a cron job or scheduled query to run this daily
-- ============================================================================

REFRESH MATERIALIZED VIEW merged_ads_spending;

-- Verify the refresh worked
SELECT
  'Refresh completed' as status,
  NOW() as timestamp,
  (SELECT COUNT(*) FROM merged_ads_spending) as total_rows;
