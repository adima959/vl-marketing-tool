import { Select, Typography } from 'antd';
import { PlusOutlined, CheckOutlined } from '@ant-design/icons';
import { DIMENSION_GROUPS, ALL_DIMENSIONS } from '@/config/dimensions';
import { useReportStore } from '@/stores/reportStore';

const { Text } = Typography;

export function DimensionPicker() {
  const { dimensions, addDimension } = useReportStore();

  const handleSelect = (value: string) => {
    addDimension(value);
  };

  // Build options with group labels
  const options = DIMENSION_GROUPS.map((group) => ({
    label: <Text type="secondary" style={{ fontSize: 12 }}>{group.label}</Text>,
    options: group.dimensions.map((dim) => ({
      value: dim.id,
      label: (
        <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {dim.label}
          {dimensions.includes(dim.id) && (
            <CheckOutlined style={{ color: '#00B96B', fontSize: 12 }} />
          )}
        </span>
      ),
      disabled: dimensions.includes(dim.id),
    })),
  }));

  return (
    <Select
      placeholder="Add Dimension"
      size="large"
      style={{ width: 180 }}
      options={options}
      onSelect={handleSelect}
      value={null}
      suffixIcon={<PlusOutlined />}
      showSearch
      filterOption={(input, option) => {
        const dim = ALL_DIMENSIONS.find((d) => d.id === option?.value);
        return dim?.label.toLowerCase().includes(input.toLowerCase()) ?? false;
      }}
    />
  );
}
