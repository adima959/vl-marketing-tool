'use client';

import { useState, useCallback } from 'react';
import { BulbOutlined } from '@ant-design/icons';
import { EditableField } from '@/components/ui/EditableField';
import type { MessageDetail, CopyVariation, Campaign, CampaignPerformanceData, Geography, GeoStage, Channel } from '@/types';
import { CopyVariationsSection } from './CopyVariationsSection';
import { GeoTracksSection } from './GeoTracksSection';
import styles from './ConceptDetailPanel.module.css';

interface StrategyCopyTabProps {
  message: MessageDetail;
  performanceData: Record<string, CampaignPerformanceData>;
  performanceLoading: boolean;
  dateRange: { start: Date; end: Date };
  onDateRangeChange: (range: { start: Date; end: Date }) => void;
  onFieldChange: (field: string, value: string | string[] | CopyVariation[]) => void;
  onAddGeo: (messageId: string, data: { geo: Geography }) => void;
  onUpdateGeoStage: (geoId: string, data: { stage: GeoStage }) => void;
  onRemoveGeo: (geoId: string) => void;
  onDeleteCampaign: (id: string) => void;
  onAddCampaign: (messageId: string, data: { name?: string; channel: Channel; geo: Geography; externalId?: string }) => void;
  onCampaignClick: (campaign: Campaign) => void;
}

const HYPOTHESIS_FIELDS = [
  { key: 'specificPainPoint', label: 'Pain Point', placeholder: 'What specific pain does the customer feel?', quoted: true, color: '#ef4444', bgColor: '#fef2f2', icon: '\uD83C\uDFAF' },
  { key: 'corePromise', label: 'Core Promise', placeholder: 'What do we promise to solve?', quoted: true, color: '#059669', bgColor: '#ecfdf5', icon: '\u2728' },
  { key: 'keyIdea', label: 'Key Idea', placeholder: 'The insight that connects pain to solution', quoted: false, color: '#d97706', bgColor: '#fffbeb', icon: '\uD83D\uDCA1' },
  { key: 'primaryHookDirection', label: 'Hook Direction', placeholder: 'Creative direction for the hook', quoted: false, color: '#7c3aed', bgColor: '#f5f3ff', icon: '\uD83D\uDE80' },
] as const;

export function StrategyCopyTab({
  message,
  performanceData,
  performanceLoading,
  dateRange,
  onDateRangeChange,
  onFieldChange,
  onAddGeo,
  onUpdateGeoStage,
  onRemoveGeo,
  onDeleteCampaign,
  onAddCampaign,
  onCampaignClick,
}: StrategyCopyTabProps): React.ReactNode {
  const [hypothesisOpen, setHypothesisOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(true);

  const handleVariationsChange = useCallback((variations: CopyVariation[]): void => {
    onFieldChange('copyVariations', variations);
  }, [onFieldChange]);

  return (
    <>
      {/* Collapsible Hypothesis & Strategy */}
      <button
        type="button"
        className={styles.strategySectionToggle}
        onClick={() => setHypothesisOpen(prev => !prev)}
      >
        <span className={styles.strategySectionIcon}>
          <BulbOutlined />
        </span>
        <span className={styles.strategySectionTitle}>Hypothesis & Strategy</span>
      </button>

      {hypothesisOpen && (
        <div className={styles.hypothesisGrid}>
          {HYPOTHESIS_FIELDS.map(({ key, label, placeholder, quoted, color, bgColor, icon }) => (
            <div key={key} className={styles.hypothesisCard} style={{ borderLeftColor: color }}>
              <div className={styles.hypothesisCardHeader}>
                <span
                  className={styles.hypothesisCardIcon}
                  style={{ background: bgColor }}
                >
                  {icon}
                </span>
                <span className={styles.hypothesisCardLabel} style={{ color }}>{label}</span>
              </div>
              <EditableField
                value={(message[key] as string) || ''}
                onChange={(val) => onFieldChange(key, val)}
                placeholder={placeholder}
                quoted={quoted}
                multiline
              />
            </div>
          ))}
        </div>
      )}

      {/* Copy Variations */}
      <CopyVariationsSection
        variations={message.copyVariations || []}
        onChange={handleVariationsChange}
        open={copyOpen}
        onToggle={() => setCopyOpen(prev => !prev)}
      />

      {/* Geo Tracks */}
      <GeoTracksSection
        message={message}
        performanceData={performanceData}
        performanceLoading={performanceLoading}
        dateRange={dateRange}
        onDateRangeChange={onDateRangeChange}
        onAddGeo={onAddGeo}
        onUpdateGeoStage={onUpdateGeoStage}
        onRemoveGeo={onRemoveGeo}
        onDeleteCampaign={onDeleteCampaign}
        onAddCampaign={onAddCampaign}
        onCampaignClick={onCampaignClick}
      />
    </>
  );
}
