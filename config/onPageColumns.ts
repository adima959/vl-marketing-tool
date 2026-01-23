import type { MetricColumn } from '@/types';

export const ON_PAGE_METRIC_COLUMNS: MetricColumn[] = [
  // Engagement Metrics
  {
    id: 'pageViews',
    label: 'Page Views',
    shortLabel: 'Views',
    format: 'number',
    category: 'basic',
    defaultVisible: true,
    width: 100,
    align: 'right',
  },
  {
    id: 'uniqueVisitors',
    label: 'Unique Visitors',
    shortLabel: 'Visitors',
    format: 'number',
    category: 'basic',
    defaultVisible: true,
    width: 100,
    align: 'right',
  },
  {
    id: 'bounceRate',
    label: 'Bounce Rate',
    shortLabel: 'Bounce',
    format: 'percentage',
    category: 'basic',
    defaultVisible: true,
    width: 90,
    align: 'right',
  },
  {
    id: 'avgActiveTime',
    label: 'Avg Active Time',
    shortLabel: 'Avg Time',
    format: 'decimal',
    category: 'basic',
    defaultVisible: true,
    width: 100,
    align: 'right',
  },

  // Interaction Metrics
  {
    id: 'scrollPastHero',
    label: 'Scroll Past Hero',
    shortLabel: 'Hero Scroll',
    format: 'number',
    category: 'conversions',
    defaultVisible: true,
    width: 110,
    align: 'right',
  },
  {
    id: 'scrollRate',
    label: 'Scroll Rate',
    shortLabel: 'Scroll %',
    format: 'percentage',
    category: 'conversions',
    defaultVisible: true,
    width: 100,
    align: 'right',
  },
  {
    id: 'formViews',
    label: 'Form Views',
    shortLabel: 'Form Views',
    format: 'number',
    category: 'conversions',
    defaultVisible: true,
    width: 110,
    align: 'right',
  },
  {
    id: 'formStarters',
    label: 'Form Starters',
    shortLabel: 'Form Start',
    format: 'number',
    category: 'conversions',
    defaultVisible: true,
    width: 110,
    align: 'right',
  },
  {
    id: 'ctaClicks',
    label: 'CTA Clicks',
    shortLabel: 'CTA Clicks',
    format: 'number',
    category: 'conversions',
    defaultVisible: true,
    width: 110,
    align: 'right',
  },
];

export const ON_PAGE_DEFAULT_VISIBLE_COLUMNS = ON_PAGE_METRIC_COLUMNS
  .filter((col) => col.defaultVisible)
  .map((col) => col.id);
