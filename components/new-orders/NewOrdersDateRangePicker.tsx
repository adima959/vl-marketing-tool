import { DatePicker } from 'antd';
import { SwapRightOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import type { Dayjs } from 'dayjs';
import { useNewOrdersStore } from '@/stores/newOrdersStore';
import styles from './NewOrdersDateRangePicker.module.css';

// Extend dayjs with plugins
dayjs.extend(utc);

const { RangePicker } = DatePicker;

export function NewOrdersDateRangePicker() {
  const { dateRange, setDateRange } = useNewOrdersStore();

  const handleChange = (dates: [Dayjs | null, Dayjs | null] | null) => {
    if (dates && dates[0] && dates[1]) {
      // Extract date components from local dayjs object
      // and create UTC dates to preserve the calendar date
      const start = dayjs.utc()
        .year(dates[0].year())
        .month(dates[0].month())
        .date(dates[0].date())
        .startOf('day')
        .toDate();

      // For end date, use the same date (not endOf day which can roll to next day)
      const end = dayjs.utc()
        .year(dates[1].year())
        .month(dates[1].month())
        .date(dates[1].date())
        .startOf('day')
        .toDate();

      setDateRange({ start, end });
    }
  };

  const rangePresets: { label: string; value: [Dayjs, Dayjs] }[] = [
    { label: 'Today', value: [dayjs().startOf('day'), dayjs().endOf('day')] },
    { label: 'Yesterday', value: [dayjs().subtract(1, 'day').startOf('day'), dayjs().subtract(1, 'day').endOf('day')] },
    { label: 'This Week', value: [dayjs().startOf('week'), dayjs().endOf('week')] },
    { label: 'Last Week', value: [dayjs().subtract(1, 'week').startOf('week'), dayjs().subtract(1, 'week').endOf('week')] },
    { label: 'This Month', value: [dayjs().startOf('month'), dayjs().endOf('month')] },
    { label: 'Last Month', value: [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')] },
    { label: 'Last 7 Days', value: [dayjs().subtract(6, 'day').startOf('day'), dayjs().endOf('day')] },
    { label: 'Last 30 Days', value: [dayjs().subtract(29, 'day').startOf('day'), dayjs().endOf('day')] },
    { label: 'Last 90 Days', value: [dayjs().subtract(89, 'day').startOf('day'), dayjs().endOf('day')] },
  ];

  return (
    <div className={styles.datePickerWrapper}>
      <RangePicker
        className={styles.rangePicker}
        size="large"
        format="DD/MM/YYYY"
        value={[dayjs(dateRange.start), dayjs(dateRange.end)]}
        onChange={handleChange}
        separator={<SwapRightOutlined className={styles.separator} />}
        allowClear={false}
        presets={rangePresets}
      />
    </div>
  );
}
