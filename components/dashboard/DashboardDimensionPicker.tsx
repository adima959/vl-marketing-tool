import { Button, Dropdown, Typography } from 'antd';
import { PlusOutlined, CheckOutlined } from '@ant-design/icons';
import { DASHBOARD_DIMENSION_GROUPS } from '@/config/dashboardDimensions';
import { useDashboardStore } from '@/stores/dashboardStore';
import type { MenuProps } from 'antd';
import styles from './DashboardDimensionPicker.module.css';

const { Text } = Typography;

export function DashboardDimensionPicker() {
  const { dimensions, addDimension } = useDashboardStore();

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    addDimension(key);
  };

  // Build menu items with group labels
  const items: MenuProps['items'] = DASHBOARD_DIMENSION_GROUPS.map((group) => ({
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
      menu={{ items, onClick: handleMenuClick }}
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
