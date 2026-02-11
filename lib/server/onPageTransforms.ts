/**
 * Pure transform functions for on-page analysis CRM matching.
 *
 * These are stateless data transforms extracted from the on-page query route
 * so they can be tested independently without any database or HTTP dependencies.
 */

/**
 * Builds a tracking combo key, optionally excluding specified fields.
 * Used to match CRM and PG data on shared tracking IDs while avoiding
 * circular dependencies when grouping by a dimension that IS a tracking field.
 */
export function buildTrackingKey(
  source: string,
  campaign_id: string,
  adset_id: string,
  ad_id: string,
  excludeFields: string[] = []
): string {
  // Normalize 'null' strings to empty strings (CRM stores literal 'null')
  // Runtime nulls can arrive from DB despite the string type annotation
  const normalize = (val: string): string =>
    val === 'null' || (val as string | null) === null ? '' : val;

  const parts: string[] = [];
  if (!excludeFields.includes('source')) parts.push(normalize(source));
  if (!excludeFields.includes('campaign_id')) parts.push(normalize(campaign_id));
  if (!excludeFields.includes('adset_id')) parts.push(normalize(adset_id));
  if (!excludeFields.includes('ad_id')) parts.push(normalize(ad_id));
  return parts.join('::');
}

/**
 * Joins CRM tracking data with PG page view tracking data to attribute
 * CRM conversions to any page view dimension via shared tracking IDs.
 * Distributes trials/approved proportionally by visitor count when a
 * tracking combo spans multiple dimension values.
 *
 * Excludes specified tracking fields from the combo key to avoid circular
 * matching when grouping by those dimensions or when they're parent filters.
 */
export function buildTrackingCrmMatch(
  crmTrackingRows: Array<{ source: string; campaign_id: string; adset_id: string; ad_id: string; trials: number; approved: number }>,
  pgTrackingRows: Array<{ dimension_value: string | null; source: string; campaign_id: string; adset_id: string; ad_id: string; unique_visitors: number }>,
  excludeFields: string[]
): Map<string, { trials: number; approved: number }> {

  // Index CRM data by tracking combo key (excluding specified fields)
  const crmIndex = new Map<string, { trials: number; approved: number }>();
  for (const row of crmTrackingRows) {
    const key = buildTrackingKey(row.source, row.campaign_id, row.adset_id, row.ad_id, excludeFields);
    const existing = crmIndex.get(key) || { trials: 0, approved: 0 };
    existing.trials += Number(row.trials);
    existing.approved += Number(row.approved);
    crmIndex.set(key, existing);
  }

  // Sum visitors per tracking combo across all dimension values
  const comboTotals = new Map<string, number>();
  for (const row of pgTrackingRows) {
    const key = buildTrackingKey(row.source, row.campaign_id, row.adset_id, row.ad_id, excludeFields);
    comboTotals.set(key, (comboTotals.get(key) || 0) + Number(row.unique_visitors));
  }

  // Distribute CRM data proportionally per dimension value
  const result = new Map<string, { trials: number; approved: number }>();
  for (const row of pgTrackingRows) {
    const comboKey = buildTrackingKey(row.source, row.campaign_id, row.adset_id, row.ad_id, excludeFields);
    const crmData = crmIndex.get(comboKey);
    if (!crmData) continue;

    const totalVisitors = comboTotals.get(comboKey) || 1;
    const proportion = Number(row.unique_visitors) / totalVisitors;

    const dimKey = row.dimension_value != null
      ? String(row.dimension_value).toLowerCase()
      : 'unknown';
    const existing = result.get(dimKey) || { trials: 0, approved: 0 };
    existing.trials += crmData.trials * proportion;
    existing.approved += crmData.approved * proportion;
    result.set(dimKey, existing);
  }

  return result;
}

/**
 * Matches PG ff_visitor_ids against CRM ff_vid values to attribute
 * CRM conversions to any dimension value via exact visitor identification.
 * Each CRM subscription with an ff_vid is attributed to the dimension values
 * where that visitor appeared.
 */
export function buildVisitorCrmMatch(
  crmVisitorRows: Array<{ ff_vid: string; trials: number; approved: number }>,
  pgVisitorRows: Array<{ dimension_value: string | null; ff_visitor_id: string }>
): Map<string, { trials: number; approved: number }> {
  // Index CRM by ff_vid
  const crmIndex = new Map<string, { trials: number; approved: number }>();
  for (const row of crmVisitorRows) {
    crmIndex.set(row.ff_vid, { trials: Number(row.trials), approved: Number(row.approved) });
  }

  // Count how many distinct dimension values each visitor appears in
  // to distribute CRM data proportionally (avoid over-attribution)
  const visitorDimCount = new Map<string, number>();
  for (const row of pgVisitorRows) {
    if (!crmIndex.has(row.ff_visitor_id)) continue;
    visitorDimCount.set(row.ff_visitor_id, (visitorDimCount.get(row.ff_visitor_id) || 0) + 1);
  }

  // Distribute each visitor's CRM data evenly across their dimension values
  const result = new Map<string, { trials: number; approved: number }>();
  for (const row of pgVisitorRows) {
    const crmData = crmIndex.get(row.ff_visitor_id);
    if (!crmData) continue;

    const dimCount = visitorDimCount.get(row.ff_visitor_id) || 1;
    const dimKey = row.dimension_value != null
      ? String(row.dimension_value).toLowerCase()
      : 'unknown';
    const existing = result.get(dimKey) || { trials: 0, approved: 0 };
    existing.trials += crmData.trials / dimCount;
    existing.approved += crmData.approved / dimCount;
    result.set(dimKey, existing);
  }

  return result;
}
