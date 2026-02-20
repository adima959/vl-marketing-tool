-- Backup of merged_ads_spending view
-- Generated: 2026-02-20T09:17:17.927Z

CREATE OR REPLACE VIEW merged_ads_spending AS
 WITH facebook_ads AS (
         SELECT 'Facebook'::text AS network,
            fb.date_start AS date,
            fb.campaign_id::text AS campaign_id,
            fb.campaign_name,
            fb.adset_id::text AS adset_id,
            fb.adset_name,
            fb.ad_id::text AS ad_id,
            fb.ad_name,
            round(fb.spend, 2) AS cost,
            'NOK'::text AS currency,
            fb.clicks::integer AS clicks,
            fb.impressions::integer AS impressions,
            round(fb.ctr, 2) AS ctr_percent,
            round(fb.cpc, 2) AS cpc,
            round(fb.cpm, 2) AS cpm,
            COALESCE(conv.value, 0::numeric) AS conversions
           FROM marketing_fb_ads_insights fb
             LEFT JOIN LATERAL ( SELECT sum((action.value ->> 'value'::text)::numeric) AS value
                   FROM jsonb_array_elements(fb.actions) action(value)
                  WHERE (action.value ->> 'action_type'::text) = 'purchase'::text) conv ON true
          WHERE fb.spend > 0::numeric OR fb.clicks > 0 OR fb.impressions > 0
        ), google_ads_perf_agg AS (
         SELECT marketing_google_ads_ad_performance.segments_date,
            marketing_google_ads_ad_performance.campaign_id,
            marketing_google_ads_ad_performance.campaign_name,
            marketing_google_ads_ad_performance.ad_group_id,
            marketing_google_ads_ad_performance.ad_group_name,
            marketing_google_ads_ad_performance.ad_group_ad_ad_id,
            marketing_google_ads_ad_performance.ad_group_ad_ad_name,
            marketing_google_ads_ad_performance.ad_group_ad_ad_type,
            sum(marketing_google_ads_ad_performance.metrics_cost_micros) AS total_cost_micros,
            sum(marketing_google_ads_ad_performance.metrics_clicks) AS total_clicks,
            sum(marketing_google_ads_ad_performance.metrics_impressions) AS total_impressions
           FROM marketing_google_ads_ad_performance
          WHERE marketing_google_ads_ad_performance.metrics_cost_micros > 0 OR marketing_google_ads_ad_performance.metrics_clicks > 0 OR marketing_google_ads_ad_performance.metrics_impressions > 0
          GROUP BY marketing_google_ads_ad_performance.segments_date, marketing_google_ads_ad_performance.campaign_id, marketing_google_ads_ad_performance.campaign_name, marketing_google_ads_ad_performance.ad_group_id, marketing_google_ads_ad_performance.ad_group_name, marketing_google_ads_ad_performance.ad_group_ad_ad_id, marketing_google_ads_ad_performance.ad_group_ad_ad_name, marketing_google_ads_ad_performance.ad_group_ad_ad_type
        ), google_ads_conv_agg AS (
         SELECT marketing_google_ads_ad_conversions.segments_date,
            marketing_google_ads_ad_conversions.ad_group_ad_ad_id,
            marketing_google_ads_ad_conversions.campaign_id,
            marketing_google_ads_ad_conversions.ad_group_id,
            sum(marketing_google_ads_ad_conversions.metrics_conversions) AS total_conversions
           FROM marketing_google_ads_ad_conversions
          WHERE marketing_google_ads_ad_conversions.segments_conversion_action_name::text ~* 'purchase|köp|kjøp'::text
          GROUP BY marketing_google_ads_ad_conversions.segments_date, marketing_google_ads_ad_conversions.ad_group_ad_ad_id, marketing_google_ads_ad_conversions.campaign_id, marketing_google_ads_ad_conversions.ad_group_id
        ), google_ads AS (
         SELECT 'Google Ads'::text AS network,
            perf.segments_date AS date,
            perf.campaign_id::text AS campaign_id,
            perf.campaign_name,
            perf.ad_group_id::text AS adset_id,
            perf.ad_group_name AS adset_name,
            perf.ad_group_ad_ad_id::text AS ad_id,
            COALESCE(perf.ad_group_ad_ad_name, perf.ad_group_ad_ad_type) AS ad_name,
            round(perf.total_cost_micros / 1000000.0, 2) AS cost,
            'NOK'::text AS currency,
            perf.total_clicks::integer AS clicks,
            perf.total_impressions::integer AS impressions,
            round(
                CASE
                    WHEN perf.total_impressions > 0::numeric THEN perf.total_clicks / perf.total_impressions * 100::numeric
                    ELSE 0::numeric
                END, 2) AS ctr_percent,
            round(
                CASE
                    WHEN perf.total_clicks > 0::numeric THEN perf.total_cost_micros / 1000000.0 / perf.total_clicks
                    ELSE 0::numeric
                END, 2) AS cpc,
            round(
                CASE
                    WHEN perf.total_impressions > 0::numeric THEN perf.total_cost_micros / 1000000.0 / perf.total_impressions * 1000::numeric
                    ELSE 0::numeric
                END, 2) AS cpm,
            COALESCE(conv.total_conversions, 0::numeric) AS conversions
           FROM google_ads_perf_agg perf
             LEFT JOIN google_ads_conv_agg conv ON perf.segments_date = conv.segments_date AND perf.ad_group_ad_ad_id = conv.ad_group_ad_ad_id AND perf.campaign_id = conv.campaign_id AND perf.ad_group_id = conv.ad_group_id
        )
 SELECT network,
    date,
    campaign_id,
    campaign_name,
    adset_id,
    adset_name,
    ad_id,
    ad_name,
    cost,
    currency,
    clicks,
    impressions,
    ctr_percent,
    cpc,
    cpm,
    conversions
   FROM ( SELECT facebook_ads.network,
            facebook_ads.date,
            facebook_ads.campaign_id,
            facebook_ads.campaign_name,
            facebook_ads.adset_id,
            facebook_ads.adset_name,
            facebook_ads.ad_id,
            facebook_ads.ad_name,
            facebook_ads.cost,
            facebook_ads.currency,
            facebook_ads.clicks,
            facebook_ads.impressions,
            facebook_ads.ctr_percent,
            facebook_ads.cpc,
            facebook_ads.cpm,
            facebook_ads.conversions
           FROM facebook_ads
        UNION ALL
         SELECT google_ads.network,
            google_ads.date,
            google_ads.campaign_id,
            google_ads.campaign_name,
            google_ads.adset_id,
            google_ads.adset_name,
            google_ads.ad_id,
            google_ads.ad_name,
            google_ads.cost,
            google_ads.currency,
            google_ads.clicks,
            google_ads.impressions,
            google_ads.ctr_percent,
            google_ads.cpc,
            google_ads.cpm,
            google_ads.conversions
           FROM google_ads) ads_data;