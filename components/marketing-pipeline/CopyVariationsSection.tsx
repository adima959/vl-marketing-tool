'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { App, Popconfirm } from 'antd';
import { DeleteOutlined, LoadingOutlined } from '@ant-design/icons';
import { Languages } from 'lucide-react';
import { EditableField } from '@/components/ui/EditableField';
import type { CopyVariation, CopySection, CopyLanguage } from '@/types';
import { COPY_LANG_CONFIG, COPY_SECTION_CONFIG } from '@/types';
import styles from './CopyVariationsSection.module.css';

const SECTIONS: CopySection[] = ['hook', 'primaryText', 'cta'];
const LANGUAGES: CopyLanguage[] = ['en', 'no', 'se', 'dk'];

interface CopyVariationsSectionProps {
  variations: CopyVariation[];
  onChange: (variations: CopyVariation[]) => void;
}

function generateId(): string {
  return crypto.randomUUID();
}

function createEmptyVariation(): CopyVariation {
  return { id: generateId(), status: 'active', hook: {}, primaryText: {}, cta: {} };
}

/** Returns true if every cell in the variation is empty */
function isEmpty(v: CopyVariation): boolean {
  return SECTIONS.every(s => LANGUAGES.every(l => !v[s][l]?.trim()));
}

/** Ensures the list always ends with exactly one empty row */
function ensureTrailingEmpty(list: CopyVariation[]): CopyVariation[] {
  if (list.length === 0 || !isEmpty(list[list.length - 1])) {
    return [...list, createEmptyVariation()];
  }
  return list;
}

export function CopyVariationsSection({ variations, onChange }: CopyVariationsSectionProps): React.ReactNode {
  const { message } = App.useApp();
  const [local, setLocal] = useState<CopyVariation[]>(() => ensureTrailingEmpty(variations));
  const localRef = useRef(local);
  localRef.current = local;

  // Guard against re-entrant emitChange during the same React batch
  const emitLockRef = useRef(false);

  // Track which (variationId-section) pairs are currently translating
  const [translating, setTranslating] = useState<Set<string>>(new Set());

  // Store last deleted variation for undo
  const undoRef = useRef<{ variation: CopyVariation; index: number } | null>(null);

  useEffect(() => {
    if (emitLockRef.current) return;
    setLocal(ensureTrailingEmpty(variations));
  }, [variations]);

  const emitChange = useCallback((next: CopyVariation[]): void => {
    emitLockRef.current = true;
    const withTrailing = ensureTrailingEmpty(next);
    setLocal(withTrailing);
    // Only send non-empty variations to parent (don't persist the trailing empty row)
    onChange(withTrailing.filter(v => !isEmpty(v)));
    // Release lock after React processes the batch
    queueMicrotask(() => { emitLockRef.current = false; });
  }, [onChange]);

  const handleDelete = useCallback((id: string): void => {
    const current = localRef.current;
    const idx = current.findIndex(v => v.id === id);
    if (idx === -1) return;

    const deleted = current[idx];
    const next = current.filter(v => v.id !== id);

    // If empty, just remove without undo
    if (isEmpty(deleted)) {
      emitChange(next);
      return;
    }

    // Store for undo
    undoRef.current = { variation: deleted, index: idx };
    emitChange(next);

    message.open({
      type: 'success',
      content: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontWeight: 500 }}>Variation deleted</span>
          <button
            type="button"
            onClick={() => {
              const undo = undoRef.current;
              if (!undo) return;
              undoRef.current = null;
              const list = [...localRef.current];
              list.splice(undo.index, 0, undo.variation);
              emitChange(list);
              message.destroy('delete-undo');
            }}
            style={{
              background: 'var(--color-info)',
              border: 'none',
              borderRadius: 4,
              color: 'var(--color-background-primary)',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 13,
              padding: '2px 10px',
              lineHeight: '22px',
            }}
          >
            Undo
          </button>
        </span>
      ),
      key: 'delete-undo',
      duration: 5,
      style: {
        display: 'inline-flex',
        padding: '6px 12px',
        background: 'var(--color-background-primary)',
        borderRadius: 6,
        border: '1px solid var(--color-gray-200)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      },
    });
  }, [emitChange, message]);

  const handleCellChange = useCallback((
    variationId: string,
    section: CopySection,
    lang: CopyLanguage,
    value: string,
  ): void => {
    const updated = localRef.current.map(v => {
      if (v.id !== variationId) return v;
      return { ...v, [section]: { ...v[section], [lang]: value } };
    });
    emitChange(updated);
  }, [emitChange]);

  const handleTranslate = useCallback(async (variationId: string, section: CopySection): Promise<void> => {
    const variation = localRef.current.find(v => v.id === variationId);
    if (!variation) return;

    const engText = variation[section].en;
    if (!engText?.trim()) return;

    const key = `${variationId}-${section}`;
    setTranslating(prev => new Set(prev).add(key));

    try {
      const res = await fetch('/api/marketing-pipeline/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: engText, section }),
      });
      const json = await res.json();

      if (json.success && json.data) {
        const { no, se, dk } = json.data as { no: string; se: string; dk: string };
        emitChange(localRef.current.map(v => {
          if (v.id !== variationId) return v;
          return {
            ...v,
            [section]: { ...v[section], no, se, dk },
          };
        }));
      }
    } finally {
      setTranslating(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }, [emitChange]);

  // Check if a variation is the trailing empty row (last row + empty)
  const isTrailingEmpty = (index: number): boolean => {
    return index === local.length - 1 && isEmpty(local[index]);
  };

  return (
    <div className={styles.copyTableWrap}>
      <div className={styles.copyTable}>
        {/* Section group headers */}
        <div className={styles.ctSectionRow}>
          <div className={styles.ctDeleteCol} />
          {SECTIONS.map(section => (
            <div key={section} className={styles.ctSectionCell}>
              {COPY_SECTION_CONFIG[section].label}
            </div>
          ))}
        </div>

        {/* Language sub-headers */}
        <div className={styles.ctLangRow}>
          <div className={styles.ctDeleteCol} />
          {SECTIONS.map(section =>
            LANGUAGES.map(lang => (
              <div key={`${section}-${lang}`} className={styles.ctLangCell}>
                {COPY_LANG_CONFIG[lang].label}
              </div>
            ))
          )}
        </div>

        {/* Data rows — one per variation */}
        {local.map((variation, index) => (
          <div key={variation.id} className={styles.ctDataRow}>
            <div className={styles.ctDeleteBtn}>
              {/* Hide delete on the trailing empty row */}
              {!isTrailingEmpty(index) && (
                isEmpty(variation) ? (
                  <button type="button" onClick={() => handleDelete(variation.id)}>
                    <DeleteOutlined />
                  </button>
                ) : (
                  <Popconfirm
                    title="Delete variation?"
                    description="This variation has content. Are you sure?"
                    onConfirm={() => handleDelete(variation.id)}
                    okText="Delete"
                    okButtonProps={{ danger: true }}
                    cancelText="Cancel"
                  >
                    <button type="button">
                      <DeleteOutlined />
                    </button>
                  </Popconfirm>
                )
              )}
            </div>
            {SECTIONS.map(section =>
              LANGUAGES.map(lang => {
                const tKey = `${variation.id}-${section}`;
                const isBusy = translating.has(tKey);
                const isTargetLang = lang !== 'en' && isBusy;

                return (
                  <div key={`${section}-${lang}`} className={styles.ctCell}>
                    {isTargetLang ? (
                      <div className={styles.ctTranslatingCell}>
                        <LoadingOutlined style={{ fontSize: 12 }} />
                        <span>Translating...</span>
                      </div>
                    ) : (
                      <>
                        <EditableField
                          value={variation[section][lang] || ''}
                          onChange={(val) => handleCellChange(variation.id, section, lang, val)}
                          placeholder="..."
                          multiline
                        />
                        {lang === 'en' && variation[section].en?.trim() && (
                          <button
                            type="button"
                            className={styles.ctTranslateBtn}
                            onClick={() => handleTranslate(variation.id, section)}
                            disabled={isBusy}
                          >
                            {isBusy ? (
                              <LoadingOutlined style={{ fontSize: 11 }} />
                            ) : (
                              <Languages className="h-3 w-3" />
                            )}
                            <span>{isBusy ? 'Translating...' : 'Auto Translate'}</span>
                          </button>
                        )}
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
