'use client';

/**
 * Keyboard Shortcuts Component
 * Modal displaying all keyboard shortcuts (trigger: Cmd+/)
 */

import { useEffect, useState } from 'react';
import styles from './KeyboardShortcuts.module.css';

interface Shortcut {
  keys: string[];
  description: string;
  category: string;
}

const shortcuts: Shortcut[] = [
  // Navigation
  { keys: ['Cmd', 'L'], description: 'Load data', category: 'Navigation' },
  { keys: ['Cmd', 'K'], description: 'Open presets menu', category: 'Navigation' },
  { keys: ['Cmd', 'S'], description: 'Save current filters', category: 'Navigation' },
  { keys: ['Cmd', '/'], description: 'Show keyboard shortcuts', category: 'Navigation' },
  { keys: ['Esc'], description: 'Close modals', category: 'Navigation' },

  // Filters
  { keys: ['→'], description: 'Navigate dimension pills (right)', category: 'Filters' },
  { keys: ['←'], description: 'Navigate dimension pills (left)', category: 'Filters' },
  { keys: ['Delete'], description: 'Remove focused dimension pill', category: 'Filters' },

  // Table
  { keys: ['↑', '↓'], description: 'Navigate table rows', category: 'Table' },
  { keys: ['Enter'], description: 'Expand/collapse row', category: 'Table' },
];

export function KeyboardShortcuts() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+/ or Ctrl+/ to toggle shortcuts modal
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }

      // Escape to close
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  const categories = Array.from(new Set(shortcuts.map((s) => s.category)));

  return (
    <>
      <div className={styles.backdrop} onClick={() => setIsOpen(false)} />
      <div className={styles.modal} role="dialog" aria-labelledby="shortcuts-title" aria-modal="true">
        <div className={styles.header}>
          <h2 id="shortcuts-title" className={styles.title}>
            Keyboard Shortcuts
          </h2>
          <button
            className={styles.closeButton}
            onClick={() => setIsOpen(false)}
            aria-label="Close shortcuts"
          >
            ×
          </button>
        </div>

        <div className={styles.content}>
          {categories.map((category) => (
            <div key={category} className={styles.category}>
              <h3 className={styles.categoryTitle}>{category}</h3>
              <div className={styles.shortcutList}>
                {shortcuts
                  .filter((s) => s.category === category)
                  .map((shortcut, index) => (
                    <div key={index} className={styles.shortcutItem}>
                      <span className={styles.description}>{shortcut.description}</span>
                      <div className={styles.keys}>
                        {shortcut.keys.map((key, i) => (
                          <span key={i}>
                            <kbd className={styles.key}>{key}</kbd>
                            {i < shortcut.keys.length - 1 && (
                              <span className={styles.plus}>+</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>

        <div className={styles.footer}>
          <p className={styles.hint}>
            Press <kbd className={styles.keySmall}>Cmd</kbd> +{' '}
            <kbd className={styles.keySmall}>/</kbd> to toggle this menu
          </p>
        </div>
      </div>
    </>
  );
}
