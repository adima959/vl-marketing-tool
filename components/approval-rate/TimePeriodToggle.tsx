'use client';

import { Radio } from 'antd';
import { useApprovalRateStore } from '@/stores/approvalRateStore';
import type { TimePeriod } from '@/types';

/**
 * Toggle between Weekly, Bi-weekly, and Monthly time periods
 */
export function TimePeriodToggle() {
  const { timePeriod, setTimePeriod } = useApprovalRateStore();

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
