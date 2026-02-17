-- Migration: Drop campaign status column
-- Status is now derived from lastActivityDate, not stored in database
--
-- ≤ 3 days ago: active
-- 4-30 days ago: paused
-- > 30 days ago: stopped
--
-- Run this SQL in your PostgreSQL database to remove the column

-- Check if column exists before dropping
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'app_pipeline_campaigns'
      AND column_name = 'status'
  ) THEN
    -- Drop the status column
    ALTER TABLE app_pipeline_campaigns DROP COLUMN status;
    RAISE NOTICE 'Column "status" dropped from app_pipeline_campaigns';
  ELSE
    RAISE NOTICE 'Column "status" does not exist in app_pipeline_campaigns';
  END IF;
END $$;

-- Also drop the index on status if it exists
DROP INDEX IF EXISTS idx_pl_campaigns_status;

-- Note: app_campaign_status enum type still exists but is unused
-- Enum types cannot be easily dropped if they have dependencies
-- Safe to leave in place (no performance impact)
