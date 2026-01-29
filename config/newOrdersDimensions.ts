import type { DimensionGroupConfig } from '@/types';

export const NEW_ORDERS_DIMENSION_GROUPS: DimensionGroupConfig[] = [
  {
    id: 'orders',
    label: 'Order Dimensions',
    dimensions: [
      { id: 'country', label: 'Country', group: 'orders' },
      { id: 'product', label: 'Product', group: 'orders' },
    ],
  },
];

export const ALL_NEW_ORDERS_DIMENSIONS = NEW_ORDERS_DIMENSION_GROUPS.flatMap((g) => g.dimensions);

export const getNewOrdersDimensionLabel = (id: string): string => {
  const dim = ALL_NEW_ORDERS_DIMENSIONS.find((d) => d.id === id);
  return dim?.label ?? id;
};
