'use client';

import { useState } from 'react';
import { Target, SlidersHorizontal } from 'lucide-react';
import { Alert, Button } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { PageHeader } from '@/components/layout/PageHeader';
import { PipelineBoard } from '@/components/marketing-tracker/PipelineBoard';
import { PipelineFilters } from '@/components/marketing-tracker/PipelineFilters';
import { ConceptDetailPanel } from '@/components/marketing-tracker/ConceptDetailPanel';
import { NewMessageModal } from '@/components/marketing-tracker/NewMessageModal';
import { AngleManagerModal } from '@/components/marketing-tracker/AngleManagerModal';
import { usePipelineStore } from '@/stores/pipelineStore';
import { usePipelineUrlSync } from '@/hooks/usePipelineUrlSync';
import styles from './page.module.css';

export default function PipelinePage() {
  const { isPanelOpen, closePanel, selectedMessage } = usePipelineStore();
  const [newConceptOpen, setNewConceptOpen] = useState(false);
  const [anglesOpen, setAnglesOpen] = useState(false);

  usePipelineUrlSync();

  return (
    <>
      <Alert
        title={<span style={{ color: '#d32f2f' }}>This page is still under development — feel free to explore, but nothing here is final.</span>}
        type="warning"
        banner
        showIcon={false}
        style={{ textAlign: 'center' }}
      />
      <PageHeader
        title="Marketing Pipeline"
        icon={<Target className="h-5 w-5" />}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button
              icon={<SlidersHorizontal className="h-3.5 w-3.5" />}
              onClick={() => setAnglesOpen(true)}
              className={styles.manageBtn}
              size="small"
            >
              Angles
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setNewConceptOpen(true)}>
              New Message
            </Button>
          </div>
        }
      />
      <div className={styles.container}>
        <PipelineFilters />
        <PipelineBoard />
      </div>
      <ConceptDetailPanel
        open={isPanelOpen}
        message={selectedMessage}
        onClose={closePanel}
      />
      <NewMessageModal open={newConceptOpen} onClose={() => setNewConceptOpen(false)} />
      <AngleManagerModal open={anglesOpen} onClose={() => setAnglesOpen(false)} />
    </>
  );
}
