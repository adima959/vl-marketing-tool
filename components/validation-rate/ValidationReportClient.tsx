'use client';

import { useCallback } from 'react';
import { Button } from 'antd';
import { PageHeader } from '@/components/layout/PageHeader';
import { ValidationRateFilterToolbar } from '@/components/validation-rate/ValidationRateFilterToolbar';
import { ValidationRateDataTable } from '@/components/validation-rate/ValidationRateDataTable';
import { SavedViewsDropdown } from '@/components/saved-views/SavedViewsDropdown';
import { useValidationRateUrlSync } from '@/hooks/useValidationRateUrlSync';
import { useApplyViewFromUrl } from '@/hooks/useApplyViewFromUrl';
import pageStyles from '@/components/dashboard/dashboard.module.css';
import type { ResolvedViewParams } from '@/types/savedViews';
import type { LucideIcon } from 'lucide-react';
import type { UseBoundStore, StoreApi } from 'zustand';
import type { ValidationRateStore } from '@/types/validationRate';

type RateType = 'approval' | 'buy' | 'pay';

interface ValidationConfig {
  title: string;
  Icon: LucideIcon;
  useStore: UseBoundStore<StoreApi<ValidationRateStore>>;
  urlParam: RateType;
  promptTitle: string;
  rateType?: RateType;
  modalRecordLabel?: string;
}

interface ValidationReportClientProps {
  type: string;
  config: ValidationConfig;
}

export function ValidationReportClient({ type, config }: ValidationReportClientProps) {
  const { title, Icon, useStore, urlParam, promptTitle, rateType, modalRecordLabel } = config;
  const { hasUnsavedChanges, resetFilters } = useStore();

  // Sync store state with URL parameters and auto-load data
  useValidationRateUrlSync(useStore, urlParam);

  const handleApplyView = useCallback((params: ResolvedViewParams) => {
    const store = useStore.getState();
    useStore.setState({
      dateRange: { start: params.start, end: params.end },
      ...(params.dimensions && { dimensions: params.dimensions }),
      ...(params.period && { timePeriod: params.period }),
      hasUnsavedChanges: false,
    });
    if (params.sortBy) {
      store.setSort(params.sortBy, params.sortDir ?? 'descend');
    } else {
      store.loadData();
    }
  }, [useStore]);

  useApplyViewFromUrl(handleApplyView);

  const getCurrentState = useCallback(() => {
    const { dateRange, dimensions, sortColumn, sortDirection, timePeriod } = useStore.getState();
    return { dateRange, dimensions, sortBy: sortColumn, sortDir: sortDirection, period: timePeriod };
  }, [useStore]);

  const headerActions = (
    <>
      {hasUnsavedChanges && (
        <Button type="text" onClick={resetFilters} size="small">
          Reset
        </Button>
      )}
    </>
  );

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title={title}
        icon={<Icon className="h-5 w-5" />}
        actions={headerActions}
        titleExtra={
          <SavedViewsDropdown
            pagePath={`/validation-reports/${type}`}
            onApplyView={handleApplyView}
            getCurrentState={getCurrentState}
          />
        }
      />
      <div className={pageStyles.content}>
        <ValidationRateFilterToolbar useStore={useStore} />
        <ValidationRateDataTable
          useStore={useStore}
          promptTitle={promptTitle}
          promptText="Select your dimensions, time period, and date range above, then click &quot;Load Data&quot; to get started."
          rateType={rateType}
          modalRecordLabel={modalRecordLabel}
        />
      </div>
    </div>
  );
}
