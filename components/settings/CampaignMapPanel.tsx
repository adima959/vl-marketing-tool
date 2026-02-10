'use client';

import {
  fetchCampaignClassifications,
  classifyCampaign,
  ignoreCampaign,
  autoMatchCampaigns,
  unclassifyCampaign,
} from '@/lib/api/campaignClassificationsClient';
import type {
  ClassifiedCampaign,
  IgnoredCampaign,
  UnclassifiedCampaign,
} from '@/lib/api/campaignClassificationsClient';
import { GenericMapPanel } from './GenericMapPanel';

export function CampaignMapPanel(): React.ReactNode {
  return (
    <GenericMapPanel<UnclassifiedCampaign, ClassifiedCampaign, IgnoredCampaign>
      fetchData={fetchCampaignClassifications}
      classify={(campaignId, productId, countryCode) => classifyCampaign(campaignId, productId, countryCode)}
      ignore={(campaignId) => ignoreCampaign(campaignId)}
      autoMatch={autoMatchCampaigns}
      unclassify={unclassifyCampaign}
      // Unclassified accessors
      getUnclassifiedId={(campaign) => campaign.campaignId}
      getUnclassifiedName={(campaign) => campaign.campaignName}
      // Classified accessors
      getClassifiedId={(item) => item.id}
      getClassifiedItemId={(item) => item.campaignId}
      getClassifiedName={(item) => item.campaignName}
      getClassifiedProduct={(item) => ({
        id: item.productId,
        name: item.productName,
        color: item.productColor,
      })}
      getClassifiedCountry={(item) => item.countryCode}
      // Ignored accessors
      getIgnoredId={(item) => item.id}
      getIgnoredItemId={(item) => item.campaignId}
      getIgnoredName={(item) => item.campaignName}
      // Reconstruction
      reconstructUnclassified={(campaignId, campaignName) => ({ campaignId, campaignName })}
      // Labels
      labels={{ singular: 'campaign', plural: 'campaigns' }}
    />
  );
}
