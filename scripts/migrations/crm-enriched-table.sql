-- Migration: Create crm_subscription_enriched table
-- Target: MariaDB
-- Purpose: Pre-computed CRM data eliminating 4-table JOINs at read time
--
-- Every row = one trial subscription (upsells excluded, soft-deleted excluded)
-- Source/country pre-normalized, ff_vid/ff_funnel_id pre-parsed from tags
--
-- Run via: npx tsx scripts/refresh-crm-enriched.ts (creates table + populates)
-- Rollback: DROP TABLE IF EXISTS crm_subscription_enriched;

CREATE TABLE IF NOT EXISTS crm_subscription_enriched (
  subscription_id INT UNSIGNED PRIMARY KEY,
  date_create DATETIME NOT NULL,

  -- Pre-normalized source (google, facebook, etc.)
  source_normalized VARCHAR(100),
  -- Pre-normalized country (DK, SE, NO, FI, etc.)
  country_normalized VARCHAR(25),

  -- Tracking IDs (copied directly from subscription table)
  tracking_id VARCHAR(300),
  tracking_id_2 VARCHAR(300),
  tracking_id_4 VARCHAR(300),

  -- Parsed from subscription.tag (comma-delimited key=value pairs)
  ff_vid VARCHAR(100),
  ff_funnel_id VARCHAR(100),

  -- 1 when invoice is_marked=1 AND deleted=0, else 0
  is_approved TINYINT(1) NOT NULL DEFAULT 0,

  INDEX idx_date (date_create),
  INDEX idx_source_date (source_normalized, date_create),
  INDEX idx_tracking_combo (source_normalized(50), tracking_id_4(100), tracking_id_2(100), tracking_id(100)),
  INDEX idx_country (country_normalized, date_create),
  INDEX idx_ff_vid (ff_vid),
  INDEX idx_ff_funnel (ff_funnel_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
