-- ============================================================================
-- DROP AND RECREATE merged_ads_spending VIEW
-- ============================================================================
-- This script fixes the duplicate data issue in the Google Ads section
-- by pre-aggregating conversions in a CTE before joining
-- ============================================================================

-- Step 1: Drop existing materialized view
DROP MATERIALIZED VIEW IF EXISTS merged_ads_spending;

-- Step 2: Create corrected materialized view
CREATE MATERIALIZED VIEW merged_ads_spending AS

-- Facebook Ads data (no changes needed)
SELECT
  'Facebook'::text AS network,
  fb_ads_insights.date_start AS date,
  fb_ads_insights.campaign_id::text AS campaign_id,
  fb_ads_insights.campaign_name,
  fb_ads_insights.adset_id::text AS adset_id,
  fb_ads_insights.adset_name,
  fb_ads_insights.ad_id::text AS ad_id,
  fb_ads_insights.ad_name,
  ROUND(fb_ads_insights.spend, 2) AS cost,
  'NOK'::text AS currency,
  fb_ads_insights.clicks::integer AS clicks,
  fb_ads_insights.impressions::integer AS impressions,
  ROUND(fb_ads_insights.ctr, 2) AS ctr_percent,
  ROUND(fb_ads_insights.cpc, 2) AS cpc,
  ROUND(fb_ads_insights.cpm, 2) AS cpm,
  COALESCE(
    (
      SELECT SUM((action.value ->> 'value'::text)::numeric)
      FROM jsonb_array_elements(fb_ads_insights.actions) action (value)
      WHERE (action.value ->> 'action_type'::text) = 'purchase'::text
    ),
    0::numeric
  ) AS conversions
FROM fb_ads_insights
WHERE
  fb_ads_insights.spend > 0::numeric
  OR fb_ads_insights.clicks > 0
  OR fb_ads_insights.impressions > 0

UNION ALL

-- Google Ads data (FIXED - conversions pre-aggregated in CTE)
SELECT
  'Google Ads'::text AS network,
  perf.segments_date AS date,
  perf.campaign_id::text AS campaign_id,
  perf.campaign_name,
  perf.ad_group_id::text AS adset_id,
  perf.ad_group_name AS adset_name,
  perf.ad_group_ad_ad_id::text AS ad_id,
  COALESCE(
    perf.ad_group_ad_ad_name,
    perf.ad_group_ad_ad_type
  ) AS ad_name,
  ROUND(perf.metrics_cost_micros / 1000000.0, 2) AS cost,
  'NOK'::text AS currency,
  perf.metrics_clicks::integer AS clicks,
  perf.metrics_impressions::integer AS impressions,
  ROUND(
    CASE
      WHEN perf.metrics_impressions > 0 THEN
        perf.metrics_clicks::numeric / perf.metrics_impressions * 100
      ELSE 0
    END,
    2
  ) AS ctr_percent,
  ROUND(
    CASE
      WHEN perf.metrics_clicks > 0 THEN
        perf.metrics_cost_micros / 1000000.0 / perf.metrics_clicks
      ELSE 0
    END,
    2
  ) AS cpc,
  ROUND(
    CASE
      WHEN perf.metrics_impressions > 0 THEN
        perf.metrics_cost_micros / 1000000.0 / perf.metrics_impressions * 1000
      ELSE 0
    END,
    2
  ) AS cpm,
  COALESCE(conv.total_conversions, 0) AS conversions
FROM google_ads_ad_performance perf
LEFT JOIN (
  -- Pre-aggregate conversions to prevent duplicate rows
  SELECT
    segments_date,
    ad_group_ad_ad_id,
    campaign_id,
    ad_group_id,
    SUM(metrics_conversions) as total_conversions
  FROM google_ads_ad_conversions
  WHERE
    segments_conversion_action_name::text ~~* '%purchase%'::text
    OR segments_conversion_action_name::text ~~* '%köp%'::text
    OR segments_conversion_action_name::text ~~* '%kjøp%'::text
  GROUP BY segments_date, ad_group_ad_ad_id, campaign_id, ad_group_id
) conv
  ON perf.segments_date = conv.segments_date
  AND perf.ad_group_ad_ad_id = conv.ad_group_ad_ad_id
  AND perf.campaign_id = conv.campaign_id
  AND perf.ad_group_id = conv.ad_group_id
WHERE
  perf.metrics_cost_micros > 0
  OR perf.metrics_clicks > 0
  OR perf.metrics_impressions > 0;

-- Step 3: Create indexes on the materialized view
-- Note: Materialized views CAN have indexes!
CREATE INDEX IF NOT EXISTS idx_merged_ads_spending_date
  ON merged_ads_spending (date);

CREATE INDEX IF NOT EXISTS idx_merged_ads_spending_network
  ON merged_ads_spending (network);

CREATE INDEX IF NOT EXISTS idx_merged_ads_spending_campaign
  ON merged_ads_spending (campaign_name);

CREATE INDEX IF NOT EXISTS idx_merged_ads_spending_composite
  ON merged_ads_spending (network, date, campaign_id, adset_id, ad_id);

-- Note: Cannot create indexes directly on views
-- Instead, ensure base tables have proper indexes:

-- Facebook Ads indexes
CREATE INDEX IF NOT EXISTS idx_fb_ads_date
  ON fb_ads_insights (date_start);

CREATE INDEX IF NOT EXISTS idx_fb_ads_campaign
  ON fb_ads_insights (campaign_name);

CREATE INDEX IF NOT EXISTS idx_fb_ads_adset
  ON fb_ads_insights (adset_name);

-- Google Ads performance indexes
CREATE INDEX IF NOT EXISTS idx_google_perf_date
  ON google_ads_ad_performance (segments_date);

CREATE INDEX IF NOT EXISTS idx_google_perf_campaign
  ON google_ads_ad_performance (campaign_name);

CREATE INDEX IF NOT EXISTS idx_google_perf_adgroup
  ON google_ads_ad_performance (ad_group_name);

CREATE INDEX IF NOT EXISTS idx_google_perf_composite
  ON google_ads_ad_performance (segments_date, ad_group_ad_ad_id, campaign_id, ad_group_id);

-- Google Ads conversions indexes
CREATE INDEX IF NOT EXISTS idx_google_conv_composite
  ON google_ads_ad_conversions (segments_date, ad_group_ad_ad_id, campaign_id, ad_group_id);

CREATE INDEX IF NOT EXISTS idx_google_conv_action
  ON google_ads_ad_conversions (segments_conversion_action_name);

-- Step 4: Refresh the materialized view to populate it with data
-- IMPORTANT: Run this after creating the view!
-- REFRESH MATERIALIZED VIEW merged_ads_spending;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Check for duplicates in the new view
SELECT
  'Duplicate check' as test,
  network,
  date,
  campaign_id,
  adset_id,
  ad_id,
  COUNT(*) as count
FROM merged_ads_spending
WHERE date = '2026-01-18'
GROUP BY network, date, campaign_id, adset_id, ad_id
HAVING COUNT(*) > 1
LIMIT 10;

-- Verify totals for Jan 18
SELECT
  'Jan 18 totals' as test,
  network,
  COUNT(*) as row_count,
  ROUND(SUM(cost::numeric), 2) as total_cost,
  SUM(clicks) as total_clicks,
  SUM(impressions) as total_impressions,
  SUM(conversions::numeric) as total_conversions
FROM merged_ads_spending
WHERE date = '2026-01-18'
GROUP BY network
ORDER BY network;
