import { throwAuthError, isAuthError } from '@/lib/api/errorHandler';

export interface ClassifiedCampaign {
  id: string;
  campaignId: string;
  campaignName: string;
  productId: string;
  productName: string;
  productColor: string;
  countryCode: string;
}

export interface IgnoredCampaign {
  id: string;
  campaignId: string;
  campaignName: string;
}

export interface ProductOption {
  id: string;
  name: string;
  color: string;
}

export interface UnclassifiedCampaign {
  campaignId: string;
  campaignName: string;
}

export interface CampaignClassificationsData {
  unclassified: UnclassifiedCampaign[];
  classified: ClassifiedCampaign[];
  ignored: IgnoredCampaign[];
  products: ProductOption[];
}

export async function fetchCampaignClassifications(): Promise<CampaignClassificationsData> {
  const res = await fetch('/api/marketing/campaign-classifications');

  if (isAuthError(res.status)) {
    throwAuthError();
  }

  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Failed to fetch campaign classifications');
  return json.data;
}

export async function classifyCampaign(
  campaignId: string,
  productId: string,
  countryCode: string
): Promise<ClassifiedCampaign> {
  const res = await fetch('/api/marketing/campaign-classifications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ campaignId, productId, countryCode }),
  });

  if (isAuthError(res.status)) {
    throwAuthError();
  }

  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Failed to classify campaign');
  return json.data;
}

export async function ignoreCampaign(campaignId: string): Promise<IgnoredCampaign> {
  const res = await fetch('/api/marketing/campaign-classifications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ campaignId, action: 'ignore' }),
  });

  if (isAuthError(res.status)) {
    throwAuthError();
  }

  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Failed to ignore campaign');
  return json.data;
}

export interface AutoMatchResult {
  matchedCount: number;
  matched: ClassifiedCampaign[];
}

export async function autoMatchCampaigns(): Promise<AutoMatchResult> {
  const res = await fetch('/api/marketing/campaign-classifications', {
    method: 'PUT',
  });

  if (isAuthError(res.status)) {
    throwAuthError();
  }

  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Failed to auto-match campaigns');
  return json.data;
}

/** Lightweight count-only fetch for badge display */
export async function fetchUnclassifiedCount(): Promise<number> {
  const res = await fetch('/api/marketing/campaign-classifications?count=true');

  if (isAuthError(res.status)) {
    throwAuthError();
  }

  const json = await res.json();
  if (!json.success) return 0;
  return json.data.unclassifiedCount;
}

export async function unclassifyCampaign(id: string): Promise<string> {
  const res = await fetch('/api/marketing/campaign-classifications', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });

  if (isAuthError(res.status)) {
    throwAuthError();
  }

  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Failed to unclassify campaign');
  return json.data.campaignId;
}
