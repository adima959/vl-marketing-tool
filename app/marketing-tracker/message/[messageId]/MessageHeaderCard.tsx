'use client';

import { CheckOutlined } from '@ant-design/icons';
import { Target, FileText, Lightbulb, MessageSquare, Video } from 'lucide-react';
import { StatusBadge } from '@/components/marketing-tracker';
import { EditableField } from '@/components/ui/EditableField';
import { EditableTags } from '@/components/ui/EditableTags';
import type { Message, AngleStatus } from '@/types';
import styles from './page.module.css';

interface MessageHeaderCardProps {
  message: Message;
  saveStatus: 'idle' | 'saving' | 'saved';
  onFieldChange: (field: string, value: string | string[]) => void;
  onStatusChange: (status: AngleStatus) => void;
}

export function MessageHeaderCard({
  message,
  saveStatus,
  onFieldChange,
  onStatusChange,
}: MessageHeaderCardProps): React.ReactNode {
  const painPoint = message.specificPainPoint || '';
  const corePromise = message.corePromise || '';
  const keyIdea = message.keyIdea || '';
  const hookDirection = message.primaryHookDirection || '';
  const headlines = message.headlines || [];
  const description = message.description || '';
  const plainDescription = description.replace(/<[^>]*>/g, '');

  return (
    <div className={styles.headerCard}>
      <div className={styles.headerTop}>
        <span className={styles.headerLabel}>MESSAGE HYPOTHESIS</span>
        <div className={styles.headerActions}>
          <StatusBadge
            status={message.status}
            variant="dot"
            editable
            onChange={onStatusChange}
          />
          {saveStatus === 'saving' && <span className={styles.saveIndicator}>Saving...</span>}
          {saveStatus === 'saved' && <span className={styles.saveIndicatorDone}><CheckOutlined /> Saved</span>}
        </div>
      </div>
      <h1 className={styles.headerTitle}>{message.name}</h1>

      <div className={styles.headerGrid}>
        <div className={styles.hypothesisSection}>
          <span className={styles.sectionLabel}>
            <Lightbulb size={14} /> PAIN POINT
          </span>
          <EditableField
            value={painPoint}
            onChange={(v) => onFieldChange('specificPainPoint', v)}
            placeholder="Add a pain point..."
            quoted
            multiline
          />
        </div>

        <div className={styles.hypothesisSection}>
          <span className={styles.sectionLabel}>
            <Target size={14} /> CORE PROMISE
          </span>
          <EditableField
            value={corePromise}
            onChange={(v) => onFieldChange('corePromise', v)}
            placeholder="Add a core promise..."
            quoted
            multiline
          />
        </div>

        <div className={styles.hypothesisSection}>
          <span className={styles.sectionLabel}>
            <MessageSquare size={14} /> KEY IDEA
          </span>
          <EditableField
            value={keyIdea}
            onChange={(v) => onFieldChange('keyIdea', v)}
            placeholder="Add a key idea..."
            multiline
          />
        </div>

        <div className={styles.hypothesisSection}>
          <span className={styles.sectionLabel}>
            <Video size={14} /> HOOK DIRECTION
          </span>
          <EditableField
            value={hookDirection}
            onChange={(v) => onFieldChange('primaryHookDirection', v)}
            placeholder="Add a hook direction..."
            multiline
          />
        </div>
      </div>

      <div className={styles.headlinesSection}>
        <span className={styles.sectionLabel}>HEADLINES</span>
        <EditableTags
          tags={headlines}
          onChange={(h) => onFieldChange('headlines', h)}
          placeholder="New headline..."
          addLabel="Add"
        />
      </div>

      <div className={styles.strategySection}>
        <span className={styles.sectionLabel}>
          <FileText size={14} /> STRATEGY NOTES
        </span>
        <EditableField
          value={plainDescription}
          onChange={(v) => onFieldChange('description', v)}
          placeholder="Add strategy notes..."
          multiline
        />
      </div>
    </div>
  );
}
