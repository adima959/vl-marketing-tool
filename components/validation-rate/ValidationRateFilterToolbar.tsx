'use client';

import { DatePicker } from 'antd';
import { SwapRightOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { GenericFilterToolbar } from '@/components/filters/GenericFilterToolbar';
import { ValidationRateDimensionPicker } from './ValidationRateDimensionPicker';
import { TimePeriodToggle } from './TimePeriodToggle';
import { getValidationRateDimensionLabel } from '@/config/validationRateDimensions';
import type { ValidationRateStore } from '@/types';
import type { UseBoundStore, StoreApi } from 'zustand';
import datePickerStyles from '@/components/filters/DateRangePicker.module.css';

dayjs.extend(utc);

const { RangePicker } = DatePicker;

// Date presets for quick selection
const presets: { label: string; value: [dayjs.Dayjs, dayjs.Dayjs] }[] = [
  {
    label: 'Last 30 Days',
    value: [dayjs.utc().subtract(30, 'day').startOf('day'), dayjs.utc().subtract(1, 'day').endOf('day')],
  },
  {
    label: 'Last 60 Days',
    value: [dayjs.utc().subtract(60, 'day').startOf('day'), dayjs.utc().subtract(1, 'day').endOf('day')],
  },
  {
    label: 'Last 90 Days',
    value: [dayjs.utc().subtract(90, 'day').startOf('day'), dayjs.utc().subtract(1, 'day').endOf('day')],
  },
  {
    label: 'This Month',
    value: [dayjs.utc().startOf('month'), dayjs.utc().subtract(1, 'day').endOf('day')],
  },
  {
    label: 'Last Month',
    value: [
      dayjs.utc().subtract(1, 'month').startOf('month'),
      dayjs.utc().subtract(1, 'month').endOf('month'),
    ],
  },
  {
    label: 'This Year',
    value: [dayjs.utc().startOf('year'), dayjs.utc().subtract(1, 'day').endOf('day')],
  },
];

interface ValidationRateFilterToolbarProps {
  useStore: UseBoundStore<StoreApi<ValidationRateStore>>;
}

/**
 * Validation Rate filter toolbar
 * Thin wrapper around GenericFilterToolbar with custom date picker and TimePeriodToggle
 */
export function ValidationRateFilterToolbar({ useStore }: ValidationRateFilterToolbarProps) {
  const { dateRange, setDateRange } = useStore();

  const handleDateChange = (dates: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null) => {
    if (dates && dates[0] && dates[1]) {
      setDateRange({
        start: dates[0].toDate(),
        end: dates[1].toDate(),
      });
    }
  };

  // Custom date picker with presets + period toggle stacked below
  const customDatePicker = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-1)' }}>
      <div className={datePickerStyles.datePickerWrapper}>
        <RangePicker
          className={datePickerStyles.rangePicker}
          classNames={{ popup: { root: datePickerStyles.datePickerPopup } }}
          value={[dayjs(dateRange.start), dayjs(dateRange.end)]}
          onChange={handleDateChange}
          presets={presets}
          format="DD/MM/YYYY"
          allowClear={false}
          size="middle"
          separator={<SwapRightOutlined className={datePickerStyles.separator} />}
        />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)' }}>
        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-gray-400)', fontWeight: 600, letterSpacing: '0.06em' }}>PERIOD:</span>
        <TimePeriodToggle useStore={useStore} />
      </div>
    </div>
  );

  return (
    <GenericFilterToolbar
      useStore={useStore}
      getLabel={getValidationRateDimensionLabel}
      dimensionPicker={<ValidationRateDimensionPicker useStore={useStore} />}
      customDatePicker={customDatePicker}
      showUnsavedDot
    />
  );
}
