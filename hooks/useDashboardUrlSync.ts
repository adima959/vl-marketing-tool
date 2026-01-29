import { useGenericUrlSync } from './useGenericUrlSync';
import { useNewOrdersStore } from '@/stores/newOrdersStore';
import { fetchNewOrdersData } from '@/lib/api/newOrdersClient';
import type { NewOrdersRow } from '@/types/newOrders';

export function useNewOrdersUrlSync() {
  return useGenericUrlSync<NewOrdersRow>({
    useStore: useNewOrdersStore,
    fetchData: fetchNewOrdersData,
    defaultSortColumn: 'subscriptions',
  });
}
