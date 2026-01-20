'use client';

import { useEffect, useState } from 'react';
import styles from './ProgressBar.module.css';

interface ProgressBarProps {
  isLoading: boolean;
  progress?: number; // 0-100 for determinate mode, undefined for indeterminate
}

export function ProgressBar({ isLoading, progress }: ProgressBarProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    if (isLoading) {
      setShouldRender(true);
      // Small delay to trigger animation
      requestAnimationFrame(() => {
        setIsVisible(true);
      });
    } else {
      setIsVisible(false);
      // Wait for fade-out animation before unmounting
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  if (!shouldRender) return null;

  const isIndeterminate = progress === undefined;

  return (
    <div
      className={`${styles.progressBar} ${!isVisible ? styles.fadeOut : ''}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={isIndeterminate ? undefined : progress}
      aria-label={isIndeterminate ? 'Loading' : `Loading ${progress}%`}
    >
      <div
        className={`${styles.bar} ${isIndeterminate ? styles.indeterminate : ''}`}
        style={
          isIndeterminate
            ? undefined
            : {
                transform: `scaleX(${progress / 100})`,
              }
        }
      />
    </div>
  );
}
