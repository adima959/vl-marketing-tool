'use client';

import { Globe, Image, Video, FileText, FileCheck, Search } from 'lucide-react';
import { AssetType, ASSET_TYPE_CONFIG } from '@/types';

interface AssetTypeIconProps {
  type: AssetType;
  size?: number;
  showLabel?: boolean;
}

const iconMap = {
  Globe,
  Image,
  Video,
  FileText,
  FileCheck,
  Search,
};

export function AssetTypeIcon({ type, size = 16, showLabel = false }: AssetTypeIconProps) {
  const config = ASSET_TYPE_CONFIG[type];
  const IconComponent = iconMap[config.icon as keyof typeof iconMap];

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
      <IconComponent size={size} style={{ color: 'var(--text-secondary)' }} />
      {showLabel && <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{config.label}</span>}
    </span>
  );
}
