import { Button, Select, Space } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { DateRangePicker } from './DateRangePicker';
import { DimensionPicker } from './DimensionPicker';
import { DimensionPills } from './DimensionPills';
import { useReportStore } from '@/stores/reportStore';

export function FilterToolbar() {
  const { loadData, isLoading, hasUnsavedChanges } = useReportStore();

  return (
    <div
      style={{
        padding: '16px 20px',
        backgroundColor: '#fff',
        borderBottom: '1px solid #e0e0e0',
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
        flexShrink: 0,
      }}
    >
      {/* Row 1: Date and Load Data button */}
      <Space size={12} wrap style={{ marginBottom: 16 }}>
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
          style={{ width: 160 }}
          options={[
            { value: 'standard', label: 'Standard Report' },
            { value: 'conversion', label: 'Conversion' },
            { value: 'revenue', label: 'Revenue' },
          ]}
        />
      </Space>

      {/* Row 2: Dimension pills and add dimension */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: '#595959', minWidth: 80 }}>
          Dimensions:
        </span>
        <Space size={10} wrap style={{ flex: 1 }}>
          <DimensionPills />
          <DimensionPicker />
        </Space>
      </div>
    </div>
  );
}
