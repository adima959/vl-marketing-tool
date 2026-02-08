'use client';

import { Tag, Dropdown, type MenuProps } from 'antd';
import { useState } from 'react';
import { PipelineStage, PIPELINE_STAGE_CONFIG } from '@/types';
import dropdownStyles from '@/styles/components/dropdown.module.css';

interface PipelineStageBadgeProps {
  stage: PipelineStage;
  onChange?: (newStage: PipelineStage) => void;
  editable?: boolean;
  size?: 'small' | 'default';
}

export function PipelineStageBadge({
  stage,
  onChange,
  editable = false,
  size = 'default',
}: PipelineStageBadgeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const config = PIPELINE_STAGE_CONFIG[stage];

  const menuItems: MenuProps['items'] = Object.entries(PIPELINE_STAGE_CONFIG).map(([key, value]) => ({
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
    onChange?.(key as PipelineStage);
    setIsOpen(false);
  };

  const tagStyle = {
    color: config.color,
    backgroundColor: config.bgColor,
    border: 'none',
    cursor: editable ? 'pointer' : 'default',
    fontSize: size === 'small' ? '11px' : '12px',
    padding: size === 'small' ? '0 6px' : '2px 10px',
    lineHeight: size === 'small' ? '18px' : '22px',
    fontWeight: 600,
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
      popupRender={(menu) => <div className={dropdownStyles.dropdownMenu}>{menu}</div>}
    >
      <Tag style={tagStyle}>{config.label}</Tag>
    </Dropdown>
  );
}
