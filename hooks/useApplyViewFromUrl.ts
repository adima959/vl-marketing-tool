import { useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { fetchSavedViewById } from '@/lib/api/savedViewsClient';
import { resolveViewParams } from '@/lib/savedViews';
import type { ResolvedViewParams } from '@/types/savedViews';

/**
 * Detects `?viewId=<id>` in the URL (set when clicking a sidebar favorite),
 * fetches the saved view, resolves its params, and calls the page's apply callback.
 * Strips `viewId` from the URL afterward so normal URL sync takes over.
 */
export function useApplyViewFromUrl(
  onApplyView: (params: ResolvedViewParams) => void
): void {
  const searchParams = useSearchParams();
  const router = useRouter();
  const appliedRef = useRef(false);

  useEffect(() => {
    const viewId = searchParams.get('viewId');
    if (!viewId || appliedRef.current) return;
    appliedRef.current = true;

    (async () => {
      try {
        const view = await fetchSavedViewById(viewId);
        const params = resolveViewParams(view);
        onApplyView(params);
      } catch (err) {
        console.warn('Failed to apply view from URL:', err);
      } finally {
        // Strip viewId from URL so normal URL sync takes over
        const url = new URL(window.location.href);
        url.searchParams.delete('viewId');
        router.replace(url.pathname + url.search, { scroll: false });
      }
    })();
  }, [searchParams, onApplyView, router]);
}
