export interface ClassifiedUrl {
  id: string;
  urlPath: string;
  productId: string;
  productName: string;
  productColor: string;
  countryCode: string;
}

export interface IgnoredUrl {
  id: string;
  urlPath: string;
}

export interface ProductOption {
  id: string;
  name: string;
  color: string;
}

export interface UrlClassificationsData {
  unclassified: string[];
  classified: ClassifiedUrl[];
  ignored: IgnoredUrl[];
  products: ProductOption[];
}

export async function fetchUrlClassifications(): Promise<UrlClassificationsData> {
  const res = await fetch('/api/on-page-analysis/url-classifications');
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Failed to fetch URL classifications');
  return json.data;
}

export async function classifyUrl(
  urlPath: string,
  productId: string,
  countryCode: string
): Promise<ClassifiedUrl> {
  const res = await fetch('/api/on-page-analysis/url-classifications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urlPath, productId, countryCode }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Failed to classify URL');
  return json.data;
}

export async function ignoreUrl(urlPath: string): Promise<IgnoredUrl> {
  const res = await fetch('/api/on-page-analysis/url-classifications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urlPath, action: 'ignore' }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Failed to ignore URL');
  return json.data;
}

export interface AutoMatchResult {
  matchedCount: number;
  matched: ClassifiedUrl[];
}

export async function autoMatchUrls(): Promise<AutoMatchResult> {
  const res = await fetch('/api/on-page-analysis/url-classifications', {
    method: 'PUT',
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Failed to auto-match URLs');
  return json.data;
}

export async function unclassifyUrl(id: string): Promise<string> {
  const res = await fetch('/api/on-page-analysis/url-classifications', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Failed to unclassify URL');
  return json.data.urlPath;
}
