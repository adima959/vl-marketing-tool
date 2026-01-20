-- ============================================================================
-- CREATE FIXED merged_ads_spending MATERIALIZED VIEW
-- ============================================================================
-- FIXES: Removes device-level duplicates by aggregating Google Ads data
-- before UNION, preventing conversion count multiplication
-- ============================================================================

-- Drop existing materialized view
DROP MATERIALIZED VIEW IF EXISTS merged_ads_spending CASCADE;

-- Create fixed materialized view
CREATE MATERIALIZED VIEW merged_ads_spending AS
WITH
-- Facebook Ads data (no device segmentation issues)
facebook_ads AS (
  SELECT
    'Facebook'::text AS network,
    fb_ads_insights.date_start AS date,
    fb_ads_insights.campaign_id::text AS campaign_id,
    fb_ads_insights.campaign_name,
    fb_ads_insights.adset_id::text AS adset_id,
    fb_ads_insights.adset_name,
    fb_ads_insights.ad_id::text AS ad_id,
    fb_ads_insights.ad_name,
    round(fb_ads_insights.spend, 2) AS cost,
    'NOK'::text AS currency,
    fb_ads_insights.clicks::integer AS clicks,
    fb_ads_insights.impressions::integer AS impressions,
    round(fb_ads_insights.ctr, 2) AS ctr_percent,
    round(fb_ads_insights.cpc, 2) AS cpc,
    round(fb_ads_insights.cpm, 2) AS cpm,
    COALESCE(
      (SELECT sum((action.value ->> 'value'::text)::numeric) AS sum
       FROM jsonb_array_elements(fb_ads_insights.actions) action(value)
       WHERE (action.value ->> 'action_type'::text) = 'purchase'::text),
      0::numeric
    ) AS conversions
  FROM fb_ads_insights
  WHERE fb_ads_insights.spend > 0::numeric
     OR fb_ads_insights.clicks > 0
     OR fb_ads_insights.impressions > 0
),

-- Google Ads Performance aggregated by device
google_ads_perf_agg AS (
  SELECT
    segments_date,
    campaign_id,
    campaign_name,
    ad_group_id,
    ad_group_name,
    ad_group_ad_ad_id,
    ad_group_ad_ad_name,
    ad_group_ad_ad_type,
    -- Aggregate metrics across all devices
    SUM(metrics_cost_micros) AS total_cost_micros,
    SUM(metrics_clicks) AS total_clicks,
    SUM(metrics_impressions) AS total_impressions
  FROM google_ads_ad_performance
  WHERE metrics_cost_micros > 0
     OR metrics_clicks > 0
     OR metrics_impressions > 0
  GROUP BY
    segments_date,
    campaign_id,
    campaign_name,
    ad_group_id,
    ad_group_name,
    ad_group_ad_ad_id,
    ad_group_ad_ad_name,
    ad_group_ad_ad_type
),

-- Google Ads Conversions aggregated by device
google_ads_conv_agg AS (
  SELECT
    segments_date,
    ad_group_ad_ad_id,
    campaign_id,
    ad_group_id,
    -- Aggregate conversions across all devices
    SUM(metrics_conversions) AS total_conversions
  FROM google_ads_ad_conversions
  WHERE segments_conversion_action_name ILIKE '%purchase%'
     OR segments_conversion_action_name ILIKE '%köp%'
     OR segments_conversion_action_name ILIKE '%kjøp%'
  GROUP BY segments_date, ad_group_ad_ad_id, campaign_id, ad_group_id
),

-- Google Ads data with conversions
google_ads AS (
  SELECT
    'Google Ads'::text AS network,
    perf.segments_date AS date,
    perf.campaign_id::text AS campaign_id,
    perf.campaign_name,
    perf.ad_group_id::text AS adset_id,
    perf.ad_group_name AS adset_name,
    perf.ad_group_ad_ad_id::text AS ad_id,
    COALESCE(perf.ad_group_ad_ad_name, perf.ad_group_ad_ad_type) AS ad_name,
    round(perf.total_cost_micros::numeric / 1000000.0, 2) AS cost,
    'NOK'::text AS currency,
    perf.total_clicks::integer AS clicks,
    perf.total_impressions::integer AS impressions,
    round(
      CASE
        WHEN perf.total_impressions > 0
        THEN perf.total_clicks::numeric / perf.total_impressions::numeric * 100::numeric
        ELSE 0::numeric
      END,
      2
    ) AS ctr_percent,
    round(
      CASE
        WHEN perf.total_clicks > 0
        THEN perf.total_cost_micros::numeric / 1000000.0 / perf.total_clicks::numeric
        ELSE 0::numeric
      END,
      2
    ) AS cpc,
    round(
      CASE
        WHEN perf.total_impressions > 0
        THEN perf.total_cost_micros::numeric / 1000000.0 / perf.total_impressions::numeric * 1000::numeric
        ELSE 0::numeric
      END,
      2
    ) AS cpm,
    COALESCE(conv.total_conversions, 0::numeric) AS conversions
  FROM google_ads_perf_agg perf
  LEFT JOIN google_ads_conv_agg conv
    ON perf.segments_date = conv.segments_date
    AND perf.ad_group_ad_ad_id = conv.ad_group_ad_ad_id
    AND perf.campaign_id = conv.campaign_id
    AND perf.ad_group_id = conv.ad_group_id
),

-- Combined ads data (Facebook + Google Ads)
ads_data AS (
  SELECT * FROM facebook_ads
  UNION ALL
  SELECT * FROM google_ads
),

-- Aggregate CRM orders by date and ad identifiers
crm_aggregated AS (
  SELECT
    DATE(created_at) as date,
    campaign_id,
    adset_id,
    ad_id,
    COUNT(*) as crm_subscriptions,
    COUNT(CASE WHEN validated_at IS NOT NULL THEN 1 END) as approved_sales
  FROM vl_crm_orders
  WHERE
    -- Filter out rows with string 'null' values
    campaign_id IS NOT NULL
    AND campaign_id != 'null'
    AND adset_id IS NOT NULL
    AND adset_id != 'null'
    AND ad_id IS NOT NULL
    AND ad_id != 'null'
  GROUP BY DATE(created_at), campaign_id, adset_id, ad_id
)

-- Final SELECT with LEFT JOIN to include CRM data
SELECT
  ads.network,
  ads.date,
  ads.campaign_id,
  ads.campaign_name,
  ads.adset_id,
  ads.adset_name,
  ads.ad_id,
  ads.ad_name,
  ads.cost,
  ads.currency,
  ads.clicks,
  ads.impressions,
  ads.ctr_percent,
  ads.cpc,
  ads.cpm,
  ads.conversions,
  -- New CRM metrics (default to 0 if no match)
  COALESCE(crm.crm_subscriptions, 0) as crm_subscriptions,
  COALESCE(crm.approved_sales, 0) as approved_sales
FROM ads_data ads
LEFT JOIN crm_aggregated crm
  ON ads.date = crm.date
  AND ads.campaign_id = crm.campaign_id
  AND ads.adset_id = crm.adset_id
  AND ads.ad_id = crm.ad_id;

-- Create indexes for performance
CREATE INDEX idx_merged_ads_date ON merged_ads_spending(date);
CREATE INDEX idx_merged_ads_campaign ON merged_ads_spending(campaign_id);
CREATE INDEX idx_merged_ads_network ON merged_ads_spending(network);

-- Verification query
SELECT
  'View created successfully' as status,
  NOW() as timestamp,
  (SELECT COUNT(*) FROM merged_ads_spending) as total_rows,
  (SELECT COUNT(*) FROM merged_ads_spending WHERE crm_subscriptions > 0) as rows_with_crm_data,
  (SELECT SUM(crm_subscriptions) FROM merged_ads_spending) as total_crm_subscriptions,
  (SELECT SUM(approved_sales) FROM merged_ads_spending) as total_approved_sales;
