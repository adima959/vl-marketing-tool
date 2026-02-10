'use client';

import {
  fetchUrlClassifications,
  classifyUrl,
  ignoreUrl,
  autoMatchUrls,
  unclassifyUrl,
} from '@/lib/api/urlClassificationsClient';
import type { ClassifiedUrl, IgnoredUrl } from '@/lib/api/urlClassificationsClient';
import { GenericMapPanel } from './GenericMapPanel';
import styles from './data-maps.module.css';

export function UrlMapPanel(): React.ReactNode {
  return (
    <GenericMapPanel<string, ClassifiedUrl, IgnoredUrl>
      fetchData={fetchUrlClassifications}
      classify={classifyUrl}
      ignore={ignoreUrl}
      autoMatch={autoMatchUrls}
      unclassify={unclassifyUrl}
      // Unclassified accessors (simple strings)
      getUnclassifiedId={(urlPath) => urlPath}
      getUnclassifiedName={(urlPath) => urlPath}
      // Classified accessors
      getClassifiedId={(item) => item.id}
      getClassifiedItemId={(item) => item.urlPath}
      getClassifiedName={(item) => item.urlPath}
      getClassifiedProduct={(item) => ({
        id: item.productId,
        name: item.productName,
        color: item.productColor,
      })}
      getClassifiedCountry={(item) => item.countryCode}
      // Ignored accessors
      getIgnoredId={(item) => item.id}
      getIgnoredItemId={(item) => item.urlPath}
      getIgnoredName={(item) => item.urlPath}
      // Reconstruction
      reconstructUnclassified={(urlPath) => urlPath}
      // Labels
      labels={{ singular: 'URL', plural: 'URLs' }}
      // Display config
      itemNameClass={styles.itemNameMono}
    />
  );
}
