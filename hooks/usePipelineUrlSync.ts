import { useEffect, useRef, useState } from 'react';
import {
  useQueryStates,
  useQueryState,
  parseAsString,
  parseAsArrayOf,
} from 'nuqs';
import { usePipelineStore } from '@/stores/pipelineStore';

/**
 * Syncs pipeline filter state (owner, product, angle, channels, geos)
 * and selected message with URL query parameters for sharing and bookmarking.
 *
 * Replaces the manual loadPipeline() useEffect on mount.
 */
export function usePipelineUrlSync(): void {
  const urlParsers = {
    owner: parseAsString.withDefault('all'),
    product: parseAsString.withDefault('all'),
    angle: parseAsString.withDefault('all'),
    channels: parseAsArrayOf(parseAsString).withDefault([]),
    geos: parseAsArrayOf(parseAsString).withDefault([]),
  } as const;

  const [urlState, setUrlState] = useQueryStates(urlParsers, {
    history: 'replace',
    shallow: true,
  });

  const [urlMessageId, setUrlMessageId] = useQueryState('messageId', parseAsString.withOptions({
    history: 'replace',
    shallow: true,
  }));

  const isInitialized = useRef(false);
  const isUpdatingFromUrl = useRef(false);
  const [isMounted, setIsMounted] = useState(false);

  const [urlTab, setUrlTab] = useQueryState('tab', parseAsString.withOptions({
    history: 'replace',
    shallow: true,
  }));

  const {
    ownerFilter,
    productFilter,
    angleFilter,
    channelFilters,
    geoFilters,
    selectedMessageId,
    detailTab,
    loadPipeline,
    selectMessage,
    setDetailTab,
  } = usePipelineStore();

  // Client-side only
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Restore filters from URL on mount, then load data
  useEffect(() => {
    if (!isMounted || isInitialized.current) return;

    // If viewId is present, skip URL init — useApplyViewFromUrl will handle it
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('viewId')) {
      isInitialized.current = true;
      return;
    }

    isInitialized.current = true;
    isUpdatingFromUrl.current = true;

    // Capture messageId from URL before we start modifying state
    const initialMessageId = urlMessageId;

    try {
      usePipelineStore.setState({
        ownerFilter: urlState.owner,
        productFilter: urlState.product,
        angleFilter: urlState.angle,
        channelFilters: urlState.channels,
        geoFilters: urlState.geos,
      });

      // Capture tab from URL
      const initialTab = urlTab as 'strategy' | 'activity' | null;

      queueMicrotask(() => {
        loadPipeline();
        // Open panel if messageId was in the URL
        if (initialMessageId) {
          selectMessage(initialMessageId);
          // Restore tab after selectMessage resets it to 'strategy'
          if (initialTab && initialTab !== 'strategy') {
            setDetailTab(initialTab);
          }
        }
      });
    } finally {
      isUpdatingFromUrl.current = false;
    }
  }, [isMounted, loadPipeline, selectMessage, urlState, urlMessageId]);

  // Update URL when store filters change
  useEffect(() => {
    if (!isMounted || !isInitialized.current || isUpdatingFromUrl.current) return;

    setUrlState({
      owner: ownerFilter !== 'all' ? ownerFilter : null,
      product: productFilter !== 'all' ? productFilter : null,
      angle: angleFilter !== 'all' ? angleFilter : null,
      channels: channelFilters.length > 0 ? channelFilters : null,
      geos: geoFilters.length > 0 ? geoFilters : null,
    });
  }, [isMounted, ownerFilter, productFilter, angleFilter, channelFilters, geoFilters, setUrlState]);

  // Update URL when selected message or tab changes
  useEffect(() => {
    if (!isMounted || !isInitialized.current || isUpdatingFromUrl.current) return;

    setUrlMessageId(selectedMessageId ?? null);
    // Only show tab in URL when panel is open and tab is not the default
    setUrlTab(selectedMessageId && detailTab !== 'strategy' ? detailTab : null);
  }, [isMounted, selectedMessageId, detailTab, setUrlMessageId, setUrlTab]);
}
