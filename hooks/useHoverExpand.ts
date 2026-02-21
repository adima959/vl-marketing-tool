'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface UseHoverExpandOptions {
  openDelay?: number;
  closeDelay?: number;
  onOpen?: () => void;
  onClose?: () => void;
}

interface UseHoverExpandReturn {
  isExpanded: boolean;
  handlers: {
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    onTouchStart: (e: React.TouchEvent) => void;
  };
  close: () => void;
}

export function useHoverExpand(options?: UseHoverExpandOptions): UseHoverExpandReturn {
  const { openDelay = 150, closeDelay = 300, onOpen, onClose } = options ?? {};
  const [isExpanded, setIsExpanded] = useState(false);
  const openTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const clearTimers = useCallback(() => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  const close = useCallback(() => {
    clearTimers();
    setIsExpanded(false);
    onClose?.();
  }, [clearTimers, onClose]);

  const onMouseEnter = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    openTimer.current = setTimeout(() => {
      onOpen?.();
      setIsExpanded(true);
    }, openDelay);
  }, [openDelay, onOpen]);

  const onMouseLeave = useCallback(() => {
    if (openTimer.current) clearTimeout(openTimer.current);
    closeTimer.current = setTimeout(() => {
      setIsExpanded(false);
      onClose?.();
    }, closeDelay);
  }, [closeDelay, onClose]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    if (isExpanded) {
      close();
    } else {
      onOpen?.();
      setIsExpanded(true);
    }
  }, [isExpanded, close, onOpen]);

  useEffect(() => clearTimers, [clearTimers]);

  return { isExpanded, handlers: { onMouseEnter, onMouseLeave, onTouchStart }, close };
}
