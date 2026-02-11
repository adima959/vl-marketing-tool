import { useMemo } from 'react';
import { ON_PAGE_METRIC_COLUMNS } from '@/config/onPageColumns';
import { useOnPageColumnStore } from '@/stores/onPageColumnStore';
import { GenericColumnSettingsModal } from '@/components/modals/GenericColumnSettingsModal';

interface OnPageColumnSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Column settings modal for On-Page Analysis page
 * Thin wrapper around GenericColumnSettingsModal with page-specific configuration
 */
export function OnPageColumnSettingsModal({ open, onClose }: OnPageColumnSettingsModalProps) {
  const columnGroups = useMemo(
    () => [
      {
        title: 'Engagement',
        columns: ON_PAGE_METRIC_COLUMNS.filter((col) =>
          ['pageViews', 'uniqueVisitors', 'bounceRate', 'avgActiveTime'].includes(col.id)
        ),
        className: 'marketingGroup',
      },
      {
        title: 'Interactions',
        columns: ON_PAGE_METRIC_COLUMNS.filter((col) =>
          [
            'scrollPastHero',
            'scrollRate',
            'formViews',
            'formViewRate',
            'formStarters',
            'formStartRate',
          ].includes(col.id)
        ),
        className: 'interactionsGroup',
      },
      {
        title: 'CRM Data',
        columns: ON_PAGE_METRIC_COLUMNS.filter((col) =>
          ['crmConvRate', 'crmTrials', 'crmApproved', 'crmApprovalRate'].includes(col.id)
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
      useColumnStore={useOnPageColumnStore}
      columnGroups={columnGroups}
    />
  );
}
