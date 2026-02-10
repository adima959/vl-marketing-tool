'use client';

import { Button, Dropdown, Typography } from 'antd';
import { PlusOutlined, CheckOutlined } from '@ant-design/icons';
import type { DimensionGroupConfig } from '@/types/dimensions';
import type { MenuProps } from 'antd';
import styles from '@/components/filters/DimensionPicker.module.css';

const { Text } = Typography;

interface GenericDimensionPickerDropdownProps {
  /** Current active dimensions */
  dimensions: string[];
  /** Callback to add a dimension */
  addDimension: (id: string) => void;
  /** Available dimension groups */
  dimensionGroups: DimensionGroupConfig[];
}

/**
 * Generic dimension picker using Ant Design Dropdown
 * Simpler alternative to GenericDimensionPicker (no search, just dropdown menu)
 *
 * @example
 * ```tsx
 * <GenericDimensionPickerDropdown
 *   dimensions={dimensions}
 *   addDimension={addDimension}
 *   dimensionGroups={DIMENSION_GROUPS}
 * />
 * ```
 */
export function GenericDimensionPickerDropdown({
  dimensions,
  addDimension,
  dimensionGroups,
}: GenericDimensionPickerDropdownProps): React.ReactElement {
  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    addDimension(key);
  };

  // Build menu items with group labels
  const items: MenuProps['items'] = dimensionGroups.map((group) => ({
    type: 'group' as const,
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
