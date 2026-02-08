import { Button, Dropdown, Typography } from 'antd';
import { PlusOutlined, CheckOutlined } from '@ant-design/icons';
import { DIMENSION_GROUPS } from '@/config/dimensions';
import { useReportStore } from '@/stores/reportStore';
import type { MenuProps } from 'antd';
import styles from './DimensionPicker.module.css';

const { Text } = Typography;

export function DimensionPicker() {
  const { dimensions, addDimension } = useReportStore();

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    addDimension(key);
  };

  // Build menu items with group labels
  const items: MenuProps['items'] = DIMENSION_GROUPS.map((group) => ({
    type: 'group',
    label: <Text type="secondary" className={styles.groupLabel}>{group.label}</Text>,
    children: group.dimensions.map((dim) => ({
      key: dim.id,
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
    <Dropdown
      menu={{ items, onClick: handleMenuClick, className: styles.dropdownMenu }}
      trigger={['click']}
      placement="bottomLeft"
    >
      <Button
        type="default"
        icon={<PlusOutlined />}
        size="middle"
        className={styles.dimensionPicker}
      />
    </Dropdown>
  );
}
