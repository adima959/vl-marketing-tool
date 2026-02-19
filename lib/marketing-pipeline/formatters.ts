// Marketing Pipeline — shared number/time formatters
// Used by CampaignDetailContent, GeoTracksSection, and other pipeline components

/** Format large numbers: 1_200_000 → "1.2M", 4_500 → "4.5k", 42 → "42" */
export function fmtNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}

/** Format a ratio as percentage: 0.153 → "15.3%" */
export function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

/** Format seconds as human-readable duration: 125 → "2m 5s", 45 → "45s", null → "—" */
export function fmtTime(seconds: number | null): string {
  if (seconds == null || seconds === 0) return '\u2014';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
