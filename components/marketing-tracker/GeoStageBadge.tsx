'use client';

import { Tag, Dropdown, type MenuProps } from 'antd';
import { useState } from 'react';
import type { GeoStage } from '@/types';
import { GEO_STAGE_CONFIG } from '@/types';
import dropdownStyles from '@/styles/components/dropdown.module.css';

interface GeoStageBadgeProps {
  stage: GeoStage;
  onChange?: (newStage: GeoStage) => void;
  editable?: boolean;
  size?: 'small' | 'default';
}

export function GeoStageBadge({
  stage,
  onChange,
  editable = false,
  size = 'default',
}: GeoStageBadgeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const config = GEO_STAGE_CONFIG[stage];

  const menuItems: MenuProps['items'] = Object.entries(GEO_STAGE_CONFIG).map(([key, value]) => ({
    key,
    label: (
      <span className={dropdownStyles.menuItemWithDot}>
        <span
          className={dropdownStyles.menuDot}
          style={{ backgroundColor: value.color }}
        />
        {value.label}
      </span>
    ),
    style: {
      backgroundColor: key === stage ? value.bgColor : undefined,
    },
  }));

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    onChange?.(key as GeoStage);
    setIsOpen(false);
  };

  const tagStyle = {
    color: config.color,
    backgroundColor: config.bgColor,
    border: 'none',
    cursor: editable ? 'pointer' : 'default',
    fontSize: size === 'small' ? '10px' : '11px',
    padding: size === 'small' ? '0 6px' : '1px 8px',
    lineHeight: size === 'small' ? '16px' : '20px',
    fontWeight: 600,
    borderRadius: '4px',
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
      popupRender={(menu) => <div className={dropdownStyles.dropdownMenu}>{menu}</div>}
    >
      <Tag style={tagStyle}>{config.label}</Tag>
    </Dropdown>
  );
}
