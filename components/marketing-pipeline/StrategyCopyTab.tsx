'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useDebouncedField } from '@/hooks/useDebouncedField';
import { Tooltip } from 'antd';
import { BulbOutlined, FileTextOutlined, RightOutlined, DownOutlined } from '@ant-design/icons';
import { Languages } from 'lucide-react';
import { NotionEditor } from '@/components/ui/NotionEditor';
import { usePipelineStore } from '@/stores/pipelineStore';
import type { MessageDetail, CopyVariation } from '@/types';
import { CopyVariationsSection } from './CopyVariationsSection';
import styles from './ConceptDetailPanel.module.css';

interface StrategyCopyTabProps {
  message: MessageDetail;
  onFieldChange: (field: string, value: string | string[] | CopyVariation[]) => void;
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
  onFieldChange,
}: StrategyCopyTabProps): React.ReactNode {
  // All tabs closed by default
  const [activeTab, setActiveTab] = useState<TabType>(null);
  const updateMessageField = usePipelineStore(s => s.updateMessageField);

  const handleVariationsChange = useCallback((variations: CopyVariation[]): void => {
    onFieldChange('copyVariations', variations);
  }, [onFieldChange]);

  // Notes — saved directly via store (NotionEditor handles debounce + indicator)
  const handleNotesSave = useCallback(async (value: string): Promise<void> => {
    await updateMessageField(message.id, 'notes', value);
  }, [message.id, updateMessageField]);

  // Local state for hypothesis fields — buffers typing, syncs after idle
  const [localFields, setLocalFields] = useState<Record<string, string>>({});

  // Sync from message → local state when message changes (e.g. on open, after navigation)
  const prevMessageId = useRef<string | null>(null);
  useEffect(() => {
    if (message.id !== prevMessageId.current) {
      prevMessageId.current = message.id;
      setLocalFields({});
    }
  }, [message.id]);

  const debouncedSync = useDebouncedField(
    useCallback((key: string, value: string | string[] | unknown[]) => {
      onFieldChange(key, value as string);
    }, [onFieldChange]),
    3000,
  );

  const handleFieldChange = useCallback((key: string, value: string): void => {
    setLocalFields(prev => ({ ...prev, [key]: value }));
    debouncedSync(key, value);
  }, [debouncedSync]);

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
                    {HYPOTHESIS_FIELDS.map((field) => (
                      <div key={field.key} className={styles.hypothesisRow}>
                        <div className={styles.hypothesisLabel}>
                          <Tooltip title={field.placeholder} mouseEnterDelay={0.3} placement="top">
                            <span className={styles.hypothesisLabelText}>{field.label}</span>
                          </Tooltip>
                        </div>
                        <div className={styles.hypothesisInput}>
                          <textarea
                            className={styles.hypothesisTextarea}
                            value={localFields[field.key] ?? ((message[field.key] as string) || '')}
                            onChange={(e) => handleFieldChange(field.key, e.target.value)}
                            rows={2}
                          />
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
                  />
                </div>
              )}

              {activeTab === 'notes' && (
                <div className={styles.notesWrapper}>
                  <NotionEditor
                    value={(message.notes as string) || ''}
                    onSave={handleNotesSave}
                    placeholder="Add notes about this concept, learnings, hypotheses to test..."
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
