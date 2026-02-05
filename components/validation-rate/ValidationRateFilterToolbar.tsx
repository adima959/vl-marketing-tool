'use client';

import { Button, DatePicker } from 'antd';
import { ReloadOutlined, SwapRightOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { ValidationRateDimensionPicker } from './ValidationRateDimensionPicker';
import { ValidationRateDimensionPills } from './ValidationRateDimensionPills';
import { TimePeriodToggle } from './TimePeriodToggle';
import type { ValidationRateStore } from '@/types';
import type { UseBoundStore, StoreApi } from 'zustand';
import styles from '@/components/filters/FilterToolbar.module.css';
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

export function ValidationRateFilterToolbar({ useStore }: ValidationRateFilterToolbarProps) {
  const {
    dateRange,
    setDateRange,
    loadData,
    isLoading,
    hasUnsavedChanges,
    hasLoadedOnce,
  } = useStore();

  const handleDateChange = (
    dates: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null
  ) => {
    if (dates && dates[0] && dates[1]) {
      setDateRange({
        start: dates[0].toDate(),
        end: dates[1].toDate(),
      });
    }
  };

  return (
    <div className={styles.toolbar}>
      <div className={styles.mainRow}>
        {/* Left: Dimensions — 2/3 width */}
        <div className={styles.leftSection} style={{ flex: 2 }}>
          <div className={styles.dimensionsWrapper}>
            <span className={styles.dimensionsLabel}>DIMENSIONS:</span>
            <div className={styles.dimensionsContent}>
              <ValidationRateDimensionPills useStore={useStore} />
              <ValidationRateDimensionPicker useStore={useStore} />
            </div>
          </div>
        </div>

        {/* Right: Date range, period, and controls — 1/3 width */}
        <div className={styles.rightSection} style={{ flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className={datePickerStyles.datePickerWrapper}>
              <RangePicker
                className={datePickerStyles.rangePicker}
                classNames={{ popup: { root: datePickerStyles.datePickerPopup } }}
                value={[dayjs(dateRange.start), dayjs(dateRange.end)]}
                onChange={handleDateChange}
                presets={presets}
                format="DD/MM/YYYY"
                allowClear={false}
                size="large"
                separator={<SwapRightOutlined className={datePickerStyles.separator} />}
              />
            </div>

            <div className={styles.loadButtonWrapper}>
              <Button
                type={!hasLoadedOnce || hasUnsavedChanges ? 'primary' : 'default'}
                icon={<ReloadOutlined />}
                onClick={loadData}
                loading={isLoading}
                disabled={hasLoadedOnce && !hasUnsavedChanges}
              >
                Load Data
              </Button>
              {hasUnsavedChanges && (
                <span className={styles.unsavedDot} title="Unsaved filter changes" />
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: '#999', fontWeight: 600, letterSpacing: '0.06em' }}>PERIOD:</span>
            <TimePeriodToggle useStore={useStore} />
          </div>
        </div>
      </div>
    </div>
  );
}
