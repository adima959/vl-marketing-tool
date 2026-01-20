import { Button, Select, Space } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { DateRangePicker } from './DateRangePicker';
import { DimensionPicker } from './DimensionPicker';
import { DimensionPills } from './DimensionPills';
import { useReportStore } from '@/stores/reportStore';
import styles from './FilterToolbar.module.css';

export function FilterToolbar() {
  const { loadData, isLoading, hasUnsavedChanges } = useReportStore();

  return (
    <div className={styles.toolbar}>
      {/* Row 1: Date and Load Data button */}
      <Space size={12} wrap className={styles.topRow}>
        <DateRangePicker />

        <Button
          type={hasUnsavedChanges ? "primary" : "default"}
          icon={<ReloadOutlined />}
          onClick={loadData}
          loading={isLoading}
          disabled={!hasUnsavedChanges}
          size="large"
        >
          Load Data
        </Button>

        <Select
          defaultValue="standard"
          size="large"
          className={styles.selectReport}
          options={[
            { value: 'standard', label: 'Standard Report' },
            { value: 'conversion', label: 'Conversion' },
            { value: 'revenue', label: 'Revenue' },
          ]}
        />
      </Space>

      {/* Row 2: Dimension pills and add dimension */}
      <div className={styles.bottomRow}>
        <span className={styles.dimensionsLabel}>
          Dimensions:
        </span>
        <Space size={10} wrap className={styles.dimensionsContent}>
          <DimensionPills />
          <DimensionPicker />
        </Space>
      </div>
    </div>
  );
}
