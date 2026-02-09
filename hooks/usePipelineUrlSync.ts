import { useEffect, useRef, useState } from 'react';
import {
  useQueryStates,
  parseAsString,
  parseAsArrayOf,
} from 'nuqs';
import { usePipelineStore } from '@/stores/pipelineStore';

/**
 * Syncs pipeline filter state (owner, product, angle, channels, geos)
 * with URL query parameters for sharing and bookmarking.
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

  const isInitialized = useRef(false);
  const isUpdatingFromUrl = useRef(false);
  const [isMounted, setIsMounted] = useState(false);

  const {
    ownerFilter,
    productFilter,
    angleFilter,
    channelFilters,
    geoFilters,
    loadPipeline,
  } = usePipelineStore();

  // Client-side only
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Restore filters from URL on mount, then load data
  useEffect(() => {
    if (!isMounted || isInitialized.current) return;
    isInitialized.current = true;
    isUpdatingFromUrl.current = true;

    try {
      usePipelineStore.setState({
        ownerFilter: urlState.owner,
        productFilter: urlState.product,
        angleFilter: urlState.angle,
        channelFilters: urlState.channels,
        geoFilters: urlState.geos,
      });

      queueMicrotask(() => {
        loadPipeline();
      });
    } finally {
      isUpdatingFromUrl.current = false;
    }
  }, [isMounted, loadPipeline, urlState]);

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
}
