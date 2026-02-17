import { useMemo } from 'react';
import { METRIC_COLUMNS, MARKETING_METRIC_IDS, CRM_METRIC_IDS } from '@/config/columns';
import { useColumnStore } from '@/stores/columnStore';
import { GenericColumnSettingsModal } from './GenericColumnSettingsModal';

interface ColumnSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Column settings modal for Dashboard/Marketing Report pages
 * Thin wrapper around GenericColumnSettingsModal with page-specific configuration
 */
export function ColumnSettingsModal({ open, onClose }: ColumnSettingsModalProps) {
  const columnGroups = useMemo(
    () => [
      {
        title: 'Marketing Data',
        columns: METRIC_COLUMNS.filter((col) =>
          (MARKETING_METRIC_IDS as readonly string[]).includes(col.id)
        ),
        className: 'marketingGroup',
      },
      {
        title: 'CRM Data',
        columns: METRIC_COLUMNS.filter((col) =>
          (CRM_METRIC_IDS as readonly string[]).includes(col.id)
        ),
        className: 'crmGroup',
      },
    ],
    []
  );

  return (
    <GenericColumnSettingsModal
      open={open}
      onClose={onClose}
      useColumnStore={useColumnStore}
      columnGroups={columnGroups}
    />
  );
}
