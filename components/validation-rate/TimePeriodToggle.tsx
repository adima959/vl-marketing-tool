'use client';

import { Radio } from 'antd';
import type { ValidationRateStore, TimePeriod } from '@/types';
import type { UseBoundStore, StoreApi } from 'zustand';

interface TimePeriodToggleProps {
  useStore: UseBoundStore<StoreApi<ValidationRateStore>>;
}

/**
 * Toggle between Weekly, Bi-weekly, and Monthly time periods
 */
export function TimePeriodToggle({ useStore }: TimePeriodToggleProps) {
  const { timePeriod, setTimePeriod } = useStore();

  return (
    <Radio.Group
      value={timePeriod}
      onChange={(e) => setTimePeriod(e.target.value as TimePeriod)}
      buttonStyle="solid"
      size="small"
    >
      <Radio.Button value="weekly">Weekly</Radio.Button>
      <Radio.Button value="biweekly">Bi-weekly</Radio.Button>
      <Radio.Button value="monthly">Monthly</Radio.Button>
    </Radio.Group>
  );
}
