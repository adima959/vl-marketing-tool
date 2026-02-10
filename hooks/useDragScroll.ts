import { type RefObject, useEffect } from 'react';

/**
 * Enables click-and-drag horizontal scrolling on Ant Design tables.
 *
 * Handles two Ant Design DOM structures:
 * - scroll.x only: single `.ant-table-content` container
 * - scroll.x + scroll.y: separate `.ant-table-header` + `.ant-table-body`
 *
 * Uses a `data-drag-scroll` attribute on the wrapper div for cursor control.
 * CSS in base.module.css handles the actual cursor styling via this attribute.
 *
 * Only enables drag-to-scroll when the content is wider than the container
 * (i.e., when horizontal scrolling is actually possible).
 */
export function useDragScroll(tableRef: RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    const wrapper = tableRef.current;
    if (!wrapper) return;

    // Ant Design uses different DOM structures depending on scroll config:
    // - scroll={{ x }} only → single .ant-table-content wrapping everything
    // - scroll={{ x, y }}  → separate .ant-table-header + .ant-table-body
    const header = wrapper.querySelector('.ant-table-header') as HTMLElement | null;
    const body = wrapper.querySelector('.ant-table-body') as HTMLElement | null;
    const content = wrapper.querySelector('.ant-table-content') as HTMLElement | null;

    // The primary scroll container is .ant-table-body (split mode) or .ant-table-content (single mode)
    const scrollEl = body || content;
    if (!scrollEl) return;

    // Check if horizontal scrolling is possible
    const checkScrollable = () => {
      const isScrollable = scrollEl.scrollWidth > scrollEl.clientWidth;
      if (isScrollable) {
        // Only show grab cursor if we're not currently dragging
        if (wrapper.getAttribute('data-drag-scroll') !== 'dragging') {
          wrapper.setAttribute('data-drag-scroll', 'idle');
        }
      } else {
        // Remove the attribute entirely when not scrollable
        wrapper.removeAttribute('data-drag-scroll');
      }
      return isScrollable;
    };

    // Initial check
    let isScrollable = checkScrollable();

    // Re-check on resize
    const resizeObserver = new ResizeObserver(() => {
      isScrollable = checkScrollable();
    });

    // --- Scroll sync (only needed in split mode) ---
    let syncScroll: (() => void) | null = null;
    if (header && body) {
      syncScroll = () => { header.scrollLeft = body.scrollLeft; };
      body.addEventListener('scroll', syncScroll);
    }

    // --- Drag state ---
    let isDown = false;
    let isDragging = false;
    let startX = 0;
    let scrollStart = 0;
    const DRAG_THRESHOLD = 5; // px before drag activates (allows clicks through)

    const handleMouseDown = (e: MouseEvent) => {
      // Don't enable drag if not scrollable
      if (!isScrollable) return;

      const target = e.target as HTMLElement;
      // Don't hijack interactive elements
      if (target.closest('button, a, .ant-table-column-sorters, .expandIcon')) return;

      isDown = true;
      isDragging = false;
      startX = e.clientX;
      scrollStart = scrollEl.scrollLeft;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDown) return;

      const dx = e.clientX - startX;

      // Wait until movement exceeds threshold before activating drag
      if (!isDragging && Math.abs(dx) < DRAG_THRESHOLD) return;

      if (!isDragging) {
        isDragging = true;
        wrapper.setAttribute('data-drag-scroll', 'dragging');
        scrollEl.style.userSelect = 'none';
      }

      e.preventDefault();
      scrollEl.scrollLeft = scrollStart - dx * 2; // 2× speed multiplier
    };

    const handleMouseUp = () => {
      if (!isDown) return;
      isDown = false;
      isDragging = false;
      // Re-check scrollable state and set appropriate cursor
      checkScrollable();
      scrollEl.style.userSelect = '';
    };

    // Start observing for size changes
    resizeObserver.observe(scrollEl);

    // Attach mousedown to all scrollable areas
    scrollEl.addEventListener('mousedown', handleMouseDown);
    if (header) header.addEventListener('mousedown', handleMouseDown);

    // mousemove/mouseup on document so drag continues even outside the table
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    // Also stop drag when mouse leaves the scroll area
    scrollEl.addEventListener('mouseleave', handleMouseUp);

    return () => {
      wrapper.removeAttribute('data-drag-scroll');
      resizeObserver.disconnect();
      if (syncScroll && body) {
        body.removeEventListener('scroll', syncScroll);
      }
      scrollEl.removeEventListener('mousedown', handleMouseDown);
      if (header) header.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      scrollEl.removeEventListener('mouseleave', handleMouseUp);
    };
  }, [tableRef]);
}
