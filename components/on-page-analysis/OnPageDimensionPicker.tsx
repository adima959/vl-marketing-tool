import { Button, Dropdown, Typography } from 'antd';
import { PlusOutlined, CheckOutlined } from '@ant-design/icons';
import { ON_PAGE_DIMENSION_GROUPS } from '@/config/onPageDimensions';
import { useOnPageStore } from '@/stores/onPageStore';
import type { MenuProps } from 'antd';
import styles from '@/components/filters/DimensionPicker.module.css';

const { Text } = Typography;

export function OnPageDimensionPicker() {
  const { dimensions, addDimension } = useOnPageStore();

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    addDimension(key);
  };

  const items: MenuProps['items'] = ON_PAGE_DIMENSION_GROUPS.map((group) => ({
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
