/**
 * Set difference: Dashboard 87 vs CRM External 78
 * Run: npx tsx scripts/customer-set-diff.ts
 */

// CRM external customer IDs (extracted from HTML href="/admin/customers/{id}")
const crmExternalIds = new Set([
  267769, 267775, 267777, 267782, 267784, 267787, 267828, 267831, 267835,
  267844, 267845, 267846, 267849, 267852, 267859, 267865, 267867, 267868,
  267869, 267871, 267878, 267880, 267887, 267888, 267890, 267891, 267895,
  267897, 267900, 267906, 267913, 267915, 267918, 267920, 267925, 267926,
  267936, 267942, 267944, 267945, 267947, 267948, 267949, 267951, 267952,
  267953, 267954, 267956, 267957, 267959, 267960, 267962, 267963, 267976,
  267980, 267981, 267983, 267996, 267997, 268001, 268005, 268007, 268010,
  268012, 268013, 268015, 268016, 268017, 268021, 268022, 268023, 268028,
  268033, 268034, 268038, 268040, 268041,
]);

// Dashboard 87 customer IDs (from Query 2 — distinct customer_ids with new customer filter)
const dashboardIds = new Set([
  267741, 267742, 267753, 267760, 267764, 267769, 267775, 267776, 267777,
  267779, 267782, 267784, 267786, 267787, 267816, 267828, 267831, 267835,
  267844, 267845, 267846, 267849, 267852, 267859, 267865, 267867, 267868,
  267869, 267871, 267878, 267880, 267887, 267888, 267890, 267891, 267895,
  267897, 267900, 267906, 267913, 267915, 267918, 267920, 267925, 267926,
  267936, 267942, 267944, 267945, 267947, 267948, 267949, 267951, 267952,
  267953, 267954, 267956, 267957, 267959, 267960, 267962, 267963, 267976,
  267980, 267981, 267983, 267990, 267996, 267997, 268001, 268005, 268007,
  268010, 268012, 268013, 268015, 268016, 268017, 268021, 268022, 268023,
  268028, 268033, 268034, 268038, 268040, 268041,
]);

console.log(`CRM external count: ${crmExternalIds.size}`);
console.log(`Dashboard count: ${dashboardIds.size}`);

// In dashboard but NOT in CRM external
const inDashboardOnly = [...dashboardIds].filter(id => !crmExternalIds.has(id)).sort((a, b) => a - b);
console.log(`\nIn dashboard but NOT in CRM external (${inDashboardOnly.length}):`);
for (const id of inDashboardOnly) {
  console.log(`  ${id}`);
}

// In CRM external but NOT in dashboard
const inCrmOnly = [...crmExternalIds].filter(id => !dashboardIds.has(id)).sort((a, b) => a - b);
console.log(`\nIn CRM external but NOT in dashboard (${inCrmOnly.length}):`);
for (const id of inCrmOnly) {
  console.log(`  ${id}`);
}
