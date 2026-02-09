'use client';

import { useState, useCallback } from 'react';
import { Target, SlidersHorizontal } from 'lucide-react';
import { Alert, Button } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { PageHeader } from '@/components/layout/PageHeader';
import { PipelineBoard } from '@/components/marketing-tracker/PipelineBoard';
import { PipelineFilters } from '@/components/marketing-tracker/PipelineFilters';
import { ConceptDetailPanel } from '@/components/marketing-tracker/ConceptDetailPanel';
import { NewMessageModal } from '@/components/marketing-tracker/NewMessageModal';
import { AngleManagerModal } from '@/components/marketing-tracker/AngleManagerModal';
import { SavedViewsDropdown } from '@/components/saved-views/SavedViewsDropdown';
import { usePipelineStore } from '@/stores/pipelineStore';
import { usePipelineUrlSync } from '@/hooks/usePipelineUrlSync';
import { useApplyViewFromUrl } from '@/hooks/useApplyViewFromUrl';
import { CHANNEL_CONFIG, GEO_CONFIG } from '@/types';
import type { Channel, Geography } from '@/types';
import type { ResolvedViewParams } from '@/types/savedViews';
import styles from './page.module.css';

/** Decode pipeline filters from saved view's generic filters field */
function decodePipelineFilters(filters?: { field: string; operator: string; value: string }[]): {
  ownerFilter: string;
  productFilter: string;
  angleFilter: string;
  channelFilters: string[];
  geoFilters: string[];
} {
  const state = { ownerFilter: 'all', productFilter: 'all', angleFilter: 'all', channelFilters: [] as string[], geoFilters: [] as string[] };
  if (!filters) return state;
  for (const f of filters) {
    switch (f.field) {
      case 'owner': state.ownerFilter = f.value; break;
      case 'product': state.productFilter = f.value; break;
      case 'angle': state.angleFilter = f.value; break;
      case 'channels': state.channelFilters = f.value ? f.value.split(',') : []; break;
      case 'geos': state.geoFilters = f.value ? f.value.split(',') : []; break;
    }
  }
  return state;
}

export default function PipelinePage() {
  const { isPanelOpen, closePanel, selectedMessage } = usePipelineStore();
  const [newConceptOpen, setNewConceptOpen] = useState(false);
  const [anglesOpen, setAnglesOpen] = useState(false);

  usePipelineUrlSync();

  const handleApplyView = useCallback((params: ResolvedViewParams) => {
    const decoded = decodePipelineFilters(params.filters);
    usePipelineStore.setState(decoded);
    usePipelineStore.getState().loadPipeline();
  }, []);

  useApplyViewFromUrl(handleApplyView);

  const getCurrentState = useCallback(() => {
    const { users, products, angles, ownerFilter, productFilter, angleFilter, channelFilters, geoFilters } = usePipelineStore.getState();
    const filters: { field: string; operator: string; value: string }[] = [];
    if (ownerFilter !== 'all') filters.push({ field: 'owner', operator: 'equals', value: ownerFilter });
    if (productFilter !== 'all') filters.push({ field: 'product', operator: 'equals', value: productFilter });
    if (angleFilter !== 'all') filters.push({ field: 'angle', operator: 'equals', value: angleFilter });
    if (channelFilters.length > 0) filters.push({ field: 'channels', operator: 'equals', value: channelFilters.join(',') });
    if (geoFilters.length > 0) filters.push({ field: 'geos', operator: 'equals', value: geoFilters.join(',') });

    // Build a descriptive name from active filters
    const nameParts: string[] = [];
    if (ownerFilter !== 'all') nameParts.push(users.find(u => u.id === ownerFilter)?.name ?? ownerFilter);
    if (productFilter !== 'all') nameParts.push(products.find(p => p.id === productFilter)?.name ?? productFilter);
    if (angleFilter !== 'all') nameParts.push(angles.find(a => a.id === angleFilter)?.name ?? angleFilter);
    if (channelFilters.length > 0) nameParts.push(channelFilters.map(c => CHANNEL_CONFIG[c as Channel]?.label ?? c).join(', '));
    if (geoFilters.length > 0) nameParts.push(geoFilters.map(g => GEO_CONFIG[g as Geography]?.label ?? g).join(', '));

    return {
      ...(filters.length > 0 && { filters }),
      suggestedName: nameParts.length > 0 ? nameParts.join(' — ') : undefined,
    };
  }, []);

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
        titleExtra={
          <SavedViewsDropdown
            pagePath="/marketing-pipeline"
            onApplyView={handleApplyView}
            getCurrentState={getCurrentState}
          />
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
