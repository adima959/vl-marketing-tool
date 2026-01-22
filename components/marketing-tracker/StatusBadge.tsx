'use client';

import { Tag, Dropdown, type MenuProps } from 'antd';
import { useState } from 'react';
import { AngleStatus, STATUS_CONFIG } from '@/types';
import styles from './StatusBadge.module.css';

interface StatusBadgeProps {
  status: AngleStatus;
  onChange?: (newStatus: AngleStatus) => void;
  editable?: boolean;
  size?: 'small' | 'default';
  variant?: 'tag' | 'dot';
}

export function StatusBadge({
  status,
  onChange,
  editable = false,
  size = 'default',
  variant = 'tag'
}: StatusBadgeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const config = STATUS_CONFIG[status];

  const menuItems: MenuProps['items'] = Object.entries(STATUS_CONFIG).map(([key, value]) => ({
    key,
    label: (
      <span className={styles.menuItem}>
        <span
          className={styles.menuDot}
          style={{ backgroundColor: value.color }}
        />
        {value.label}
      </span>
    ),
    style: {
      backgroundColor: key === status ? value.bgColor : undefined,
    },
  }));

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    onChange?.(key as AngleStatus);
    setIsOpen(false);
  };

  // Dot variant - minimal indicator with just dot and label
  if (variant === 'dot') {
    const dotContent = (
      <span
        className={`${styles.dotBadge} ${editable ? styles.editable : ''}`}
        style={{
          '--dot-color': config.color,
          '--dot-bg': config.bgColor,
        } as React.CSSProperties}
      >
        <span className={styles.dot} />
        <span className={styles.dotLabel}>{config.label}</span>
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
      >
        {dotContent}
      </Dropdown>
    );
  }

  // Tag variant - pill-shaped badge
  const tagStyle = {
    color: config.color,
    backgroundColor: config.bgColor,
    border: 'none',
    cursor: editable ? 'pointer' : 'default',
    fontSize: size === 'small' ? '11px' : '12px',
    padding: size === 'small' ? '0 6px' : '2px 10px',
    lineHeight: size === 'small' ? '18px' : '22px',
    fontWeight: 500,
    borderRadius: '6px',
  };

  if (!editable) {
    return <Tag style={tagStyle}>{config.label}</Tag>;
  }

  return (
    <Dropdown
      menu={{ items: menuItems, onClick: handleMenuClick }}
      trigger={['click']}
      open={isOpen}
      onOpenChange={setIsOpen}
    >
      <Tag style={tagStyle}>{config.label}</Tag>
    </Dropdown>
  );
}
