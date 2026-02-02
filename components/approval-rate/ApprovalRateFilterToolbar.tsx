'use client';

import { Button, DatePicker } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { ApprovalRateDimensionPicker } from './ApprovalRateDimensionPicker';
import { ApprovalRateDimensionPills } from './ApprovalRateDimensionPills';
import { TimePeriodToggle } from './TimePeriodToggle';
import { useApprovalRateStore } from '@/stores/approvalRateStore';
import styles from '@/components/filters/FilterToolbar.module.css';

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

export function ApprovalRateFilterToolbar() {
  const {
    dateRange,
    setDateRange,
    loadData,
    isLoading,
    hasUnsavedChanges,
    hasLoadedOnce,
  } = useApprovalRateStore();

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
        {/* Left: Dimensions */}
        <div className={styles.leftSection}>
          <div className={styles.dimensionsWrapper}>
            <span className={styles.dimensionsLabel}>DIMENSIONS:</span>
            <div className={styles.dimensionsContent}>
              <ApprovalRateDimensionPills />
              <ApprovalRateDimensionPicker />
            </div>
          </div>
        </div>

        {/* Center: Time Period Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: '#666', fontWeight: 500 }}>PERIOD:</span>
          <TimePeriodToggle />
        </div>

        {/* Right: Date range and controls */}
        <div className={styles.rightSection}>
          <RangePicker
            value={[dayjs(dateRange.start), dayjs(dateRange.end)]}
            onChange={handleDateChange}
            presets={presets}
            format="DD/MM/YYYY"
            allowClear={false}
            size="small"
          />

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
      </div>
    </div>
  );
}
