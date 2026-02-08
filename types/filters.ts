export type FilterOperator = 'equals' | 'not_equals' | 'contains' | 'not_contains';

export interface TableFilter {
  id: string;
  field: string;
  operator: FilterOperator;
  value: string;
}
