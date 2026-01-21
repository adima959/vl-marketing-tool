export type DimensionGroup = 'advertising' | 'general' | 'pages' | 'geo' | 'device';

export interface Dimension {
  id: string;
  label: string;
  group: DimensionGroup;
}

export interface DimensionGroupConfig {
  id: DimensionGroup;
  label: string;
  dimensions: Dimension[];
}
