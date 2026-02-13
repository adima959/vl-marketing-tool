import { useCallback, useEffect, useState } from 'react';

/**
 * Enables click-and-drag horizontal scrolling on Ant Design tables.
 *
 * Returns a callback ref to attach to the table wrapper div.
 *
 * Key design decisions:
 * - Callback ref (not useRef) so the effect re-runs when the DOM element mounts
 * - All scroll-container lookups are dynamic (never cached) because Ant Design
 *   recreates .ant-table-body when table data changes (e.g. skeleton rows)
 * - mousedown delegated on the wrapper (stable) — finds scroll target on each click
 * - MutationObserver re-checks scrollability when table DOM changes
 *
 * CSS cursor styling via `data-drag-scroll` attribute (see base.module.css).
 */
export function useDragScroll(): (node: HTMLDivElement | null) => void {
  const [wrapper, setWrapper] = useState<HTMLDivElement | null>(null);

  const ref = useCallback((node: HTMLDivElement | null) => {
    setWrapper(node);
  }, []);

  useEffect(() => {
    if (!wrapper) return;

    /** Find the current scroll container (may change when Ant Design re-renders) */
    function getScrollEl(): HTMLElement | null {
      return wrapper!.querySelector<HTMLElement>('.ant-table-body')
        || wrapper!.querySelector<HTMLElement>('.ant-table-content');
    }

    /** Check if horizontal scrolling is possible and update cursor attribute */
    function checkScrollable(): boolean {
      const el = getScrollEl();
      if (!el) return false;
      const isScrollable = el.scrollWidth > el.clientWidth;
      if (isScrollable) {
        if (wrapper!.getAttribute('data-drag-scroll') !== 'dragging') {
          wrapper!.setAttribute('data-drag-scroll', 'idle');
        }
      } else {
        wrapper!.removeAttribute('data-drag-scroll');
      }
      return isScrollable;
    }

    // Initial check
    checkScrollable();

    // Re-check when table DOM changes (data load, skeleton swap, column resize)
    const observer = new MutationObserver(() => {
      checkScrollable();
    });
    observer.observe(wrapper, { childList: true, subtree: true });

    // Drag state
    let isDown = false;
    let isDragging = false;
    let startX = 0;
    let scrollStart = 0;
    let activeScrollEl: HTMLElement | null = null;
    const DRAG_THRESHOLD = 5;

    const handleMouseDown = (e: MouseEvent): void => {
      const scrollEl = getScrollEl();
      if (!scrollEl || scrollEl.scrollWidth <= scrollEl.clientWidth) return;

      const target = e.target as HTMLElement;
      // Don't hijack interactive elements or the fixed first column
      if (target.closest('button, a, .ant-table-column-sorters, .expandIcon')) return;
      // Don't drag from the sticky attribute column
      if (target.closest('.ant-table-cell-fix-left')) return;

      isDown = true;
      isDragging = false;
      startX = e.clientX;
      scrollStart = scrollEl.scrollLeft;
      activeScrollEl = scrollEl;
    };

    const handleMouseMove = (e: MouseEvent): void => {
      if (!isDown || !activeScrollEl) return;
      const dx = e.clientX - startX;
      if (!isDragging && Math.abs(dx) < DRAG_THRESHOLD) return;

      if (!isDragging) {
        isDragging = true;
        wrapper.setAttribute('data-drag-scroll', 'dragging');
        activeScrollEl.style.userSelect = 'none';
      }

      e.preventDefault();
      activeScrollEl.scrollLeft = scrollStart - dx * 2;
    };

    const handleMouseUp = (): void => {
      if (!isDown) return;
      isDown = false;
      isDragging = false;
      checkScrollable();
      if (activeScrollEl) {
        activeScrollEl.style.userSelect = '';
        activeScrollEl = null;
      }
    };

    // Delegate mousedown on the stable wrapper element
    wrapper.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      wrapper.removeAttribute('data-drag-scroll');
      observer.disconnect();
      wrapper.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [wrapper]);

  return ref;
}
