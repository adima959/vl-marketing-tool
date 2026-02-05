'use client';

import { Button, Dropdown, Typography } from 'antd';
import { PlusOutlined, CheckOutlined } from '@ant-design/icons';
import { VALIDATION_RATE_DIMENSION_GROUPS } from '@/config/validationRateDimensions';
import type { ValidationRateStore } from '@/types';
import type { UseBoundStore, StoreApi } from 'zustand';
import type { MenuProps } from 'antd';
import styles from '@/components/filters/DimensionPicker.module.css';

const { Text } = Typography;

interface ValidationRateDimensionPickerProps {
  useStore: UseBoundStore<StoreApi<ValidationRateStore>>;
}

export function ValidationRateDimensionPicker({ useStore }: ValidationRateDimensionPickerProps) {
  const { dimensions, addDimension } = useStore();

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    addDimension(key);
  };

  // Build menu items with group labels
  const items: MenuProps['items'] = VALIDATION_RATE_DIMENSION_GROUPS.map((group) => ({
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
