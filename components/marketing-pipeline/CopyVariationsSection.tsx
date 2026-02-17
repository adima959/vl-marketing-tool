'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { App, Button, Popconfirm } from 'antd';
import { PlusOutlined, DeleteOutlined, LoadingOutlined, FileTextOutlined } from '@ant-design/icons';
import { Languages } from 'lucide-react';
import { EditableField } from '@/components/ui/EditableField';
import type { CopyVariation, CopySection, CopyLanguage } from '@/types';
import { COPY_LANG_CONFIG, COPY_SECTION_CONFIG } from '@/types';
import styles from './ConceptDetailPanel.module.css';

const SECTIONS: CopySection[] = ['hook', 'primaryText', 'cta'];
const LANGUAGES: CopyLanguage[] = ['en', 'no', 'se', 'dk'];

interface CopyVariationsSectionProps {
  variations: CopyVariation[];
  onChange: (variations: CopyVariation[]) => void;
  open: boolean;
  onToggle: () => void;
}

function generateId(): string {
  return crypto.randomUUID();
}

/** Returns true if every cell in the variation is empty */
function isEmpty(v: CopyVariation): boolean {
  return SECTIONS.every(s => LANGUAGES.every(l => !v[s][l]?.trim()));
}

export function CopyVariationsSection({ variations, onChange, open, onToggle }: CopyVariationsSectionProps): React.ReactNode {
  const { message } = App.useApp();
  const [local, setLocal] = useState<CopyVariation[]>(variations);
  const localRef = useRef(local);
  localRef.current = local;

  // Track which (variationId-section) pairs are currently translating
  const [translating, setTranslating] = useState<Set<string>>(new Set());

  // Store last deleted variation for undo
  const undoRef = useRef<{ variation: CopyVariation; index: number } | null>(null);

  useEffect(() => {
    setLocal(variations);
  }, [variations]);

  const emitChange = useCallback((next: CopyVariation[]): void => {
    setLocal(next);
    onChange(next);
  }, [onChange]);

  const handleAdd = useCallback((): void => {
    emitChange([...localRef.current, {
      id: generateId(),
      status: 'active',
      hook: {},
      primaryText: {},
      cta: {},
    }]);
  }, [emitChange]);

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
              background: '#1677ff',
              border: 'none',
              borderRadius: 4,
              color: '#fff',
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
        background: '#fff',
        borderRadius: 6,
        border: '1px solid #e5e7eb',
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
    emitChange(localRef.current.map(v => {
      if (v.id !== variationId) return v;
      return { ...v, [section]: { ...v[section], [lang]: value } };
    }));
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

  return (
    <div className={styles.copyVariationsSection}>
      <div className={styles.copyVariationsHeader}>
        <button
          type="button"
          className={styles.strategySectionToggle}
          onClick={onToggle}
        >
          <span className={styles.strategySectionIcon} style={{ background: '#eff6ff' }}>
            <FileTextOutlined style={{ color: '#3b82f6' }} />
          </span>
          <span className={styles.strategySectionTitle}>Copy Variations</span>
        </button>
        {open && (
          <div className={styles.copyVariationsActions}>
            <Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleAdd}>
              Add Variation
            </Button>
          </div>
        )}
      </div>

      {open && <div className={styles.copyTableWrap}>
        {local.length === 0 ? (
          <div className={styles.copyVariationsEmpty}>No copy variations yet</div>
        ) : (
          <div className={styles.copyTable}>
            {/* Section group headers */}
            <div className={styles.ctSectionRow}>
              {SECTIONS.map(section => {
                const cfg = COPY_SECTION_CONFIG[section];
                return (
                  <div
                    key={section}
                    className={styles.ctSectionCell}
                    style={{ color: cfg.color, background: cfg.bgHeader }}
                  >
                    {cfg.label}
                  </div>
                );
              })}
              <div className={styles.ctDeleteCol} />
            </div>

            {/* Language sub-headers */}
            <div className={styles.ctLangRow}>
              {SECTIONS.map(section => {
                const cfg = COPY_SECTION_CONFIG[section];
                return LANGUAGES.map(lang => (
                  <div key={`${section}-${lang}`} className={styles.ctLangCell} style={{ background: cfg.bg }}>
                    {COPY_LANG_CONFIG[lang].label}
                  </div>
                ));
              })}
              <div className={styles.ctDeleteCol} />
            </div>

            {/* Data rows — one per variation */}
            {local.map((variation) => (
              <div key={variation.id} className={styles.ctDataRow}>
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
                <div className={styles.ctDeleteBtn}>
                  {isEmpty(variation) ? (
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
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>}
    </div>
  );
}
