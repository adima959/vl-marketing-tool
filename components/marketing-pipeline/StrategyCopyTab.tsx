'use client';

import { useState, useCallback } from 'react';
import { BulbOutlined, FileTextOutlined, RightOutlined, DownOutlined } from '@ant-design/icons';
import { Languages } from 'lucide-react';
import { RichEditableField } from '@/components/ui/RichEditableField';
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

type TabType = 'hypothesis' | 'copy' | 'notes' | null;

const HYPOTHESIS_FIELDS = [
  {
    key: 'specificPainPoint',
    label: 'Core Hypothesis',
    placeholder: 'Using \'bloating\' as the primary pain point will increase CTR by 15% among the target demographic compared to generic \'wellness\' hooks.',
    helper: 'What measurable outcome do you expect? Be specific with metrics and target audience.'
  },
  {
    key: 'corePromise',
    label: 'Strategy Execution',
    placeholder: 'Test 3 hook variations across NO, SE, and DK markets. Focus on direct-response style copy for the primary text.',
    helper: 'How will you test and execute this hypothesis? Define your approach and success criteria.'
  },
  {
    key: 'keyIdea',
    label: 'Key Insight',
    placeholder: 'The insight that connects customer pain to our solution',
    helper: 'What central insight connects the customer pain to your solution?'
  },
  {
    key: 'primaryHookDirection',
    label: 'Creative Direction',
    placeholder: 'Creative direction for the hook and messaging',
    helper: 'What is the creative approach for communicating this concept?'
  }
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
  // All tabs closed by default
  const [activeTab, setActiveTab] = useState<TabType>(null);

  const handleVariationsChange = useCallback((variations: CopyVariation[]): void => {
    onFieldChange('copyVariations', variations);
  }, [onFieldChange]);

  const handleNotesChange = useCallback((value: string): void => {
    onFieldChange('notes', value);
  }, [onFieldChange]);

  const handleFieldChange = useCallback((key: string, value: string): void => {
    onFieldChange(key, value);
  }, [onFieldChange]);

  const toggleTab = (tab: TabType) => {
    setActiveTab(activeTab === tab ? null : tab);
  };

  return (
    <>
      {/* Strategy Tabs Section */}
      <div className={styles.strategySection}>
        <div className={styles.strategyContainer}>
          {/* Tab Navigation */}
          <div className={styles.strategyTabBar}>
            <button
              type="button"
              className={`${styles.strategyTab} ${activeTab === 'hypothesis' ? styles.strategyTabActive : ''}`}
              onClick={() => toggleTab('hypothesis')}
            >
              <span className={styles.strategyTabChevron}>
                {activeTab === 'hypothesis' ? <DownOutlined /> : <RightOutlined />}
              </span>
              <BulbOutlined className={styles.strategyTabIcon} />
              <span>Hypothesis & Strategy</span>
            </button>
            <button
              type="button"
              className={`${styles.strategyTab} ${activeTab === 'copy' ? styles.strategyTabActive : ''}`}
              onClick={() => toggleTab('copy')}
            >
              <span className={styles.strategyTabChevron}>
                {activeTab === 'copy' ? <DownOutlined /> : <RightOutlined />}
              </span>
              <Languages size={16} className={styles.strategyTabIcon} />
              <span>Copy Variations</span>
            </button>
            <button
              type="button"
              className={`${styles.strategyTab} ${activeTab === 'notes' ? styles.strategyTabActive : ''}`}
              onClick={() => toggleTab('notes')}
            >
              <span className={styles.strategyTabChevron}>
                {activeTab === 'notes' ? <DownOutlined /> : <RightOutlined />}
              </span>
              <FileTextOutlined className={styles.strategyTabIcon} />
              <span>Notes</span>
            </button>
          </div>

          {/* Tab Content - Only show when tab is active */}
          {activeTab && (
            <div className={styles.strategyTabContent}>
              {activeTab === 'hypothesis' && (
                <div className={styles.hypothesisWrapper}>
                  <div className={styles.hypothesisCompact}>
                    {HYPOTHESIS_FIELDS.map((field, index) => (
                      <div key={field.key} className={styles.hypothesisRow}>
                        <div className={styles.hypothesisLabel}>
                          <span className={styles.hypothesisLabelText}>{field.label}</span>
                        </div>
                        <div className={styles.hypothesisInput}>
                          <textarea
                            className={styles.hypothesisTextarea}
                            placeholder={field.placeholder}
                            value={(message[field.key] as string) || ''}
                            onChange={(e) => handleFieldChange(field.key, e.target.value)}
                            rows={2}
                          />
                          <p className={styles.hypothesisHelper}>{field.helper}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'copy' && (
                <div className={styles.copyVariationsWrapper}>
                  <CopyVariationsSection
                    variations={message.copyVariations || []}
                    onChange={handleVariationsChange}
                    open={true}
                    onToggle={() => {}}
                  />
                </div>
              )}

              {activeTab === 'notes' && (
                <div className={styles.notesWrapper}>
                  <RichEditableField
                    value={(message.notes as string) || ''}
                    onChange={handleNotesChange}
                    placeholder="Add notes about this concept, learnings, hypotheses to test..."
                    maxCollapsedHeight={0}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Geo Tracks Section - Separate from strategy tabs */}
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
