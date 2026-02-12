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
      api={{
        fetchData: fetchCampaignClassifications,
        classify: classifyCampaign,
        ignore: ignoreCampaign,
        autoMatch: autoMatchCampaigns,
        unclassify: unclassifyCampaign,
      }}
      accessors={{
        unclassified: {
          getId: (campaign) => campaign.campaignId,
          getName: (campaign) => campaign.campaignName,
        },
        classified: {
          getId: (item) => item.id,
          getItemId: (item) => item.campaignId,
          getName: (item) => item.campaignName,
          getProduct: (item) => ({
            id: item.productId,
            name: item.productName,
            color: item.productColor,
          }),
          getCountry: (item) => item.countryCode,
        },
        ignored: {
          getId: (item) => item.id,
          getItemId: (item) => item.campaignId,
          getName: (item) => item.campaignName,
        },
        reconstructUnclassified: (campaignId, campaignName) => ({ campaignId, campaignName }),
      }}
      labels={{ singular: 'campaign', plural: 'campaigns' }}
    />
  );
}
