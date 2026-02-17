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

export function UrlMapPanel({ onUnclassifiedCountChange }: { onUnclassifiedCountChange?: (count: number) => void }): React.ReactNode {
  return (
    <GenericMapPanel<string, ClassifiedUrl, IgnoredUrl>
      onUnclassifiedCountChange={onUnclassifiedCountChange}
      api={{
        fetchData: fetchUrlClassifications,
        classify: classifyUrl,
        ignore: ignoreUrl,
        autoMatch: autoMatchUrls,
        unclassify: unclassifyUrl,
      }}
      accessors={{
        unclassified: {
          getId: (urlPath) => urlPath,
          getName: (urlPath) => urlPath,
        },
        classified: {
          getId: (item) => item.id,
          getItemId: (item) => item.urlPath,
          getName: (item) => item.urlPath,
          getProduct: (item) => ({
            id: item.productId,
            name: item.productName,
            color: item.productColor,
          }),
          getCountry: (item) => item.countryCode,
        },
        ignored: {
          getId: (item) => item.id,
          getItemId: (item) => item.urlPath,
          getName: (item) => item.urlPath,
        },
        reconstructUnclassified: (urlPath) => urlPath,
      }}
      labels={{ singular: 'URL', plural: 'URLs' }}
      itemNameClass={styles.itemNameMono}
    />
  );
}
