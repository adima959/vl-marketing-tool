'use client';

import { GenericDataTable } from '@/components/table/GenericDataTable';
import { useNewOrdersStore } from '@/stores/newOrdersStore';
import { useNewOrdersColumnStore } from '@/stores/newOrdersColumnStore';
import { NEW_ORDERS_METRIC_COLUMNS, NEW_ORDERS_COLUMN_GROUPS } from '@/config/newOrdersColumns';
import type { NewOrdersRow } from '@/types/newOrders';
import type { ColumnGroup } from '@/types/table';
import styles from './NewOrdersDataTable.module.css';

const COLUMN_GROUPS: ColumnGroup[] = NEW_ORDERS_COLUMN_GROUPS;

export function NewOrdersDataTable() {
  return (
    <GenericDataTable<NewOrdersRow>
      useStore={useNewOrdersStore}
      useColumnStore={useNewOrdersColumnStore}
      metricColumns={NEW_ORDERS_METRIC_COLUMNS}
      columnGroups={COLUMN_GROUPS}
      colorClassName={styles.newOrdersColors}
      showColumnTooltips={true}
    />
  );
}
