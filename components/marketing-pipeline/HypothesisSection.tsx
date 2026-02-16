'use client';

import { EditableField } from '@/components/ui/EditableField';
import { EditableTags } from '@/components/ui/EditableTags';
import type { MessageDetail } from '@/types';
import styles from './ConceptDetailPanel.module.css';

interface HypothesisSectionProps {
  message: MessageDetail;
  onFieldChange: (field: string, value: string | string[]) => void;
}

export function HypothesisSection({ message, onFieldChange }: HypothesisSectionProps): React.ReactNode {
  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>Hypothesis</div>

      <div className={styles.fieldGroup}>
        <div className={styles.fieldLabel}>Pain Point</div>
        <EditableField
          value={message.specificPainPoint || ''}
          onChange={(val) => onFieldChange('specificPainPoint', val)}
          placeholder="What specific pain does the customer feel?"
          quoted
          multiline
        />
      </div>

      <div className={styles.fieldGroup}>
        <div className={styles.fieldLabel}>Core Promise</div>
        <EditableField
          value={message.corePromise || ''}
          onChange={(val) => onFieldChange('corePromise', val)}
          placeholder="What do we promise to solve?"
          quoted
          multiline
        />
      </div>

      <div className={styles.fieldGroup}>
        <div className={styles.fieldLabel}>Key Idea</div>
        <EditableField
          value={message.keyIdea || ''}
          onChange={(val) => onFieldChange('keyIdea', val)}
          placeholder="The insight that connects pain to solution"
          multiline
        />
      </div>

      <div className={styles.fieldGroup}>
        <div className={styles.fieldLabel}>Hook Direction</div>
        <EditableField
          value={message.primaryHookDirection || ''}
          onChange={(val) => onFieldChange('primaryHookDirection', val)}
          placeholder="Creative direction for the hook"
          multiline
        />
      </div>

      <div className={styles.fieldGroup}>
        <div className={styles.fieldLabel}>Headlines</div>
        <EditableTags
          tags={message.headlines || []}
          onChange={(tags) => onFieldChange('headlines', tags)}
          placeholder="New headline..."
          addLabel="Add headline"
        />
      </div>
    </div>
  );
}
