'use client';

import { Tag, Dropdown, type MenuProps } from 'antd';
import { useState } from 'react';
import styles from '@/components/marketing-tracker/StatusBadge.module.css';
import dropdownStyles from '@/styles/components/dropdown.module.css';

export interface StatusConfig {
  label: string;
  color: string;
  bgColor: string;
}

interface GenericStatusBadgeProps<T extends string> {
  status: T;
  config: Record<T, StatusConfig>;
  onChange?: (newStatus: T) => void;
  editable?: boolean;
  size?: 'small' | 'default';
  variant?: 'tag' | 'dot';
  fontWeight?: number;
}

export function GenericStatusBadge<T extends string>({
  status,
  config,
  onChange,
  editable = false,
  size = 'default',
  variant = 'tag',
  fontWeight = 500,
}: GenericStatusBadgeProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const statusConfig = config[status];

  const menuItems: MenuProps['items'] = Object.entries(config).map(([key, value]) => ({
    key,
    label: (
      <span className={dropdownStyles.menuItemWithDot}>
        <span
          className={dropdownStyles.menuDot}
          style={{ backgroundColor: (value as StatusConfig).color }}
        />
        {(value as StatusConfig).label}
      </span>
    ),
    style: {
      backgroundColor: key === status ? (value as StatusConfig).bgColor : undefined,
    },
  }));

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    onChange?.(key as T);
    setIsOpen(false);
  };

  // Dot variant - minimal indicator with just dot and label
  if (variant === 'dot') {
    const dotContent = (
      <span
        className={`${styles.dotBadge} ${editable ? styles.editable : ''}`}
        style={{
          '--dot-color': statusConfig.color,
          '--dot-bg': statusConfig.bgColor,
        } as React.CSSProperties}
      >
        <span className={styles.dot} />
        <span className={styles.dotLabel}>{statusConfig.label}</span>
      </span>
    );

    if (!editable) {
      return dotContent;
    }

    return (
      <Dropdown
        menu={{ items: menuItems, onClick: handleMenuClick }}
        trigger={['click']}
        open={isOpen}
        onOpenChange={setIsOpen}
        popupRender={(menu) => <div className={dropdownStyles.dropdownMenu}>{menu}</div>}
      >
        {dotContent}
      </Dropdown>
    );
  }

  // Tag variant - pill-shaped badge
  const tagStyle = {
    color: statusConfig.color,
    backgroundColor: statusConfig.bgColor,
    border: 'none',
    cursor: editable ? 'pointer' : 'default',
    fontSize: size === 'small' ? '11px' : '12px',
    padding: size === 'small' ? '0 6px' : '2px 10px',
    lineHeight: size === 'small' ? '18px' : '22px',
    fontWeight,
    borderRadius: '6px',
  };

  if (!editable) {
    return <Tag style={tagStyle}>{statusConfig.label}</Tag>;
  }

  return (
    <Dropdown
      menu={{ items: menuItems, onClick: handleMenuClick }}
      trigger={['click']}
      open={isOpen}
      onOpenChange={setIsOpen}
      popupRender={(menu) => <div className={dropdownStyles.dropdownMenu}>{menu}</div>}
    >
      <Tag style={tagStyle}>{statusConfig.label}</Tag>
    </Dropdown>
  );
}
