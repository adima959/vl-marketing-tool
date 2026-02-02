'use client';

import { Button, Dropdown, Typography } from 'antd';
import { PlusOutlined, CheckOutlined } from '@ant-design/icons';
import { APPROVAL_RATE_DIMENSION_GROUPS } from '@/config/approvalRateDimensions';
import { useApprovalRateStore } from '@/stores/approvalRateStore';
import type { MenuProps } from 'antd';
import styles from '@/components/filters/DimensionPicker.module.css';

const { Text } = Typography;

export function ApprovalRateDimensionPicker() {
  const { dimensions, addDimension } = useApprovalRateStore();

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    addDimension(key);
  };

  // Build menu items with group labels
  const items: MenuProps['items'] = APPROVAL_RATE_DIMENSION_GROUPS.map((group) => ({
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
