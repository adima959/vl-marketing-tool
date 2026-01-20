import { Select, Typography } from 'antd';
import { PlusOutlined, CheckOutlined } from '@ant-design/icons';
import { DIMENSION_GROUPS, ALL_DIMENSIONS } from '@/config/dimensions';
import { useReportStore } from '@/stores/reportStore';
import styles from './DimensionPicker.module.css';

const { Text } = Typography;

export function DimensionPicker() {
  const { dimensions, addDimension } = useReportStore();

  const handleSelect = (value: string) => {
    addDimension(value);
  };

  // Build options with group labels
  const options = DIMENSION_GROUPS.map((group) => ({
    label: <Text type="secondary" className={styles.groupLabel}>{group.label}</Text>,
    options: group.dimensions.map((dim) => ({
      value: dim.id,
      label: (
        <span className={styles.optionLabel}>
          {dim.label}
          {dimensions.includes(dim.id) && (
            <CheckOutlined className={styles.checkIcon} />
          )}
        </span>
      ),
      disabled: dimensions.includes(dim.id),
    })),
  }));

  return (
    <Select
      className={styles.dimensionPicker}
      placeholder="Add Dimension"
      size="large"
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
