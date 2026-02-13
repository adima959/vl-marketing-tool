import { useMemo } from 'react';
import { SESSION_METRIC_COLUMNS } from '@/config/sessionColumns';
import { useSessionColumnStore } from '@/stores/sessionColumnStore';
import { GenericColumnSettingsModal } from '@/components/modals/GenericColumnSettingsModal';

interface SessionColumnSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Column settings modal for Session Analytics
 * Thin wrapper around GenericColumnSettingsModal with session-specific configuration
 */
export function SessionColumnSettingsModal({ open, onClose }: SessionColumnSettingsModalProps) {
  const columnGroups = useMemo(
    () => [
      {
        title: 'Engagement',
        columns: SESSION_METRIC_COLUMNS.filter((col) =>
          ['pageViews', 'uniqueVisitors', 'bounceRate', 'avgActiveTime'].includes(col.id)
        ),
        className: 'marketingGroup',
      },
      {
        title: 'Interactions',
        columns: SESSION_METRIC_COLUMNS.filter((col) =>
          ['scrollPastHero', 'scrollRate', 'formViews', 'formViewRate', 'formStarters', 'formStartRate'].includes(col.id)
        ),
        className: 'interactionsGroup',
      },
    ],
    []
  );

  return (
    <GenericColumnSettingsModal
      open={open}
      onClose={onClose}
      useColumnStore={useSessionColumnStore}
      columnGroups={columnGroups}
    />
  );
}
