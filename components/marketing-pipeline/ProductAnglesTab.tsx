'use client';

import { useState, useCallback, useMemo } from 'react';
import { App } from 'antd';
import { RightOutlined, DownOutlined } from '@ant-design/icons';
import { Plus, Trash2, X, Check, Pencil, Lightbulb, Loader2, AlertCircle } from 'lucide-react';
import { NotionEditor } from '@/components/ui/NotionEditor';
import type { SaveStatus } from '@/components/ui/NotionEditor';
import { usePipelineStore } from '@/stores/pipelineStore';
import type { Product, Angle } from '@/types';
import styles from './ConceptDetailPanel.module.css';

// ── Field definitions ───────────────────────────────────

const ANGLE_FIELDS = [
  {
    key: 'description' as const,
    label: 'Problem or desire',
    description: 'What problem area or desire does this angle address?',
    placeholder: 'e.g. Joint inflammation that limits daily activity...',
  },
  {
    key: 'targetAudience' as const,
    label: 'Target audience',
    description: 'Who are you writing to? Age, life situation, what defines them.',
    placeholder: 'e.g. Women 50-65, active lifestyle, starting to feel limitations...',
  },
  {
    key: 'emotionalDriver' as const,
    label: 'Emotional driver',
    description: 'The deep fear or desire behind the purchase — not the surface symptom.',
    placeholder: 'e.g. Fear of losing independence and becoming a burden...',
  },
] as const;

// ── API helpers ─────────────────────────────────────────

async function createAngleApi(productId: string, name: string): Promise<Angle> {
  const res = await fetch('/api/marketing-pipeline/angles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productId, name }),
  });
  if (!res.ok) throw new Error('Failed to create angle');
  const json = await res.json();
  return json.data;
}

async function renameAngleApi(angleId: string, name: string): Promise<void> {
  const res = await fetch(`/api/marketing-pipeline/angles/${angleId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error('Failed to rename angle');
}

async function deleteAngleApi(angleId: string): Promise<{ success: boolean; error?: string }> {
  const res = await fetch(`/api/marketing-pipeline/angles/${angleId}`, { method: 'DELETE' });
  return res.json();
}

// ── Status indicator ────────────────────────────────────

function StatusIndicator({ status }: { status: SaveStatus }): React.ReactNode {
  if (status === 'idle') return null;
  return (
    <span
      className={`${styles.accordionStatus} ${
        status === 'saving' ? styles.accordionStatusSaving :
        status === 'saved' ? styles.accordionStatusSaved :
        styles.accordionStatusError
      }`}
    >
      {status === 'saving' && <><Loader2 size={11} className={styles.accordionStatusSpinner} /> Saving</>}
      {status === 'saved' && <><Check size={11} /> Saved</>}
      {status === 'error' && <><AlertCircle size={11} /> Error</>}
    </span>
  );
}

// ── Aggregate status from multiple fields ───────────────

function aggregateStatus(statuses: Record<string, SaveStatus>): SaveStatus {
  const vals = Object.values(statuses);
  if (vals.includes('error')) return 'error';
  if (vals.includes('saving')) return 'saving';
  if (vals.includes('saved')) return 'saved';
  return 'idle';
}

// ── Main component ──────────────────────────────────────

interface ProductAnglesTabProps {
  product: Product;
}

export function ProductAnglesTab({ product }: ProductAnglesTabProps): React.ReactNode {
  const { message } = App.useApp();
  const angles = usePipelineStore(s => s.angles);
  const loadPipeline = usePipelineStore(s => s.loadPipeline);
  const updateAngleField = usePipelineStore(s => s.updateAngleField);

  // Expand / collapse
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Per-field save status: keyed by `${angleId}-${fieldKey}`
  const [fieldStatus, setFieldStatus] = useState<Record<string, SaveStatus>>({});
  // Add angle
  const [newAngleName, setNewAngleName] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  // Delete confirmation
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  // Inline rename
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  const productAngles = useMemo(
    () => angles.filter(a => a.productId === product.id),
    [angles, product.id],
  );

  const toggleExpand = useCallback((id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Save handler factory — one per angle + field
  const handleSave = useCallback((angleId: string, field: string) => {
    return async (value: string): Promise<void> => {
      await updateAngleField(angleId, field, value);
    };
  }, [updateAngleField]);

  // Status change handler factory
  const handleStatusChange = useCallback((angleId: string, field: string) => {
    return (status: SaveStatus) => {
      setFieldStatus(prev => ({ ...prev, [`${angleId}-${field}`]: status }));
    };
  }, []);

  // Get aggregated status for an angle
  const getAngleStatus = useCallback((angleId: string): SaveStatus => {
    const relevant: Record<string, SaveStatus> = {};
    for (const f of ANGLE_FIELDS) {
      const key = `${angleId}-${f.key}`;
      if (fieldStatus[key]) relevant[key] = fieldStatus[key];
    }
    return aggregateStatus(relevant);
  }, [fieldStatus]);

  // ── Add angle ──
  const handleAdd = useCallback(async () => {
    const name = newAngleName.trim();
    if (!name) return;
    setAddLoading(true);
    try {
      await createAngleApi(product.id, name);
      setNewAngleName('');
      await loadPipeline();
      message.success('Angle created');
    } catch {
      message.error('Failed to create angle');
    } finally {
      setAddLoading(false);
    }
  }, [newAngleName, product.id, loadPipeline, message]);

  // ── Delete angle ──
  const handleDelete = useCallback(async (angleId: string) => {
    const result = await deleteAngleApi(angleId);
    if (result.success) {
      setConfirmingDeleteId(null);
      await loadPipeline();
      message.success('Angle removed');
    } else {
      message.error(result.error || 'Failed to remove angle');
    }
  }, [loadPipeline, message]);

  // ── Inline rename ──
  const startEditing = useCallback((angle: Angle) => {
    setEditingId(angle.id);
    setEditingName(angle.name);
    setConfirmingDeleteId(null);
  }, []);

  const cancelEditing = useCallback(() => {
    setEditingId(null);
    setEditingName('');
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingId) return;
    const name = editingName.trim();
    if (!name) return;
    setEditLoading(true);
    try {
      await renameAngleApi(editingId, name);
      await loadPipeline();
      setEditingId(null);
      setEditingName('');
      message.success('Angle renamed');
    } catch {
      message.error('Failed to rename angle');
    } finally {
      setEditLoading(false);
    }
  }, [editingId, editingName, loadPipeline, message]);

  const canAdd = newAngleName.trim().length > 0;

  return (
    <>
      <p className={styles.researchPreamble}>
        Each angle targets a unique problem and audience. Define it here so every message underneath stays focused on the same emotional territory.
      </p>

      {productAngles.length === 0 ? (
        <div className={styles.angleEmptyState}>
          No angles yet — add your first angle to get started
        </div>
      ) : (
        productAngles.map(angle => {
          const isConfirming = confirmingDeleteId === angle.id;
          const isEditing = editingId === angle.id;
          const isExpanded = expanded.has(angle.id);
          const hasMessages = (angle.messageCount ?? 0) > 0;
          const angleStatus = getAngleStatus(angle.id);

          // Delete confirmation row
          if (isConfirming) {
            return (
              <div key={angle.id} className={styles.angleConfirmRow}>
                <span className={styles.angleConfirmText}>
                  Delete &ldquo;{angle.name}&rdquo;?
                </span>
                <button type="button" className={styles.angleConfirmYes} onClick={() => handleDelete(angle.id)}>
                  Delete
                </button>
                <button type="button" className={styles.angleConfirmCancel} onClick={() => setConfirmingDeleteId(null)}>
                  <X size={14} />
                </button>
              </div>
            );
          }

          return (
            <div key={angle.id} className={styles.accordionSection}>
              {/* Accordion header */}
              <button
                type="button"
                className={styles.accordionHeader}
                onClick={() => {
                  if (!isEditing) toggleExpand(angle.id);
                }}
                aria-expanded={isExpanded}
              >
                <span className={styles.accordionChevron}>
                  {isExpanded ? <DownOutlined /> : <RightOutlined />}
                </span>
                <span className={styles.accordionIcon}>
                  <Lightbulb size={14} />
                </span>

                {isEditing ? (
                  <>
                    <input
                      className={styles.angleRenameInput}
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === 'Enter' && editingName.trim() && editingName.trim() !== angle.name) handleSaveEdit();
                        if (e.key === 'Escape') cancelEditing();
                      }}
                      onClick={(e) => e.stopPropagation()}
                      autoFocus
                    />
                    <button
                      type="button"
                      className={`${styles.angleAccordionAction} ${styles.angleSaveAction}`}
                      onClick={(e) => { e.stopPropagation(); handleSaveEdit(); }}
                      disabled={!editingName.trim() || editingName.trim() === angle.name || editLoading}
                    >
                      <Check size={14} />
                    </button>
                    <button
                      type="button"
                      className={`${styles.angleAccordionAction} ${styles.angleCancelAction}`}
                      onClick={(e) => { e.stopPropagation(); cancelEditing(); }}
                    >
                      <X size={14} />
                    </button>
                  </>
                ) : (
                  <>
                    <span className={styles.accordionLabel}>{angle.name}</span>
                    {hasMessages && (
                      <span className={styles.angleMsgBadge}>
                        {angle.messageCount} msg{(angle.messageCount ?? 0) !== 1 ? 's' : ''}
                      </span>
                    )}
                    <StatusIndicator status={angleStatus} />
                    <div className={styles.angleAccordionActions}>
                      <button
                        type="button"
                        className={styles.angleAccordionAction}
                        onClick={(e) => { e.stopPropagation(); startEditing(angle); }}
                        title="Rename angle"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        className={`${styles.angleAccordionAction} ${styles.angleDeleteAction}`}
                        onClick={(e) => { e.stopPropagation(); if (!hasMessages) setConfirmingDeleteId(angle.id); }}
                        disabled={hasMessages}
                        title={hasMessages ? `${angle.messageCount} message(s) — remove messages first` : 'Delete angle'}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </>
                )}
              </button>

              {/* Expanded content */}
              {isExpanded && !isEditing && (
                <div className={styles.accordionContent}>
                  {ANGLE_FIELDS.map(field => (
                    <div key={field.key} className={styles.angleFieldBlock}>
                      <div className={styles.angleFieldLabel}>{field.label}</div>
                      <p className={styles.angleFieldHelper}>{field.description}</p>
                      <div className={styles.notesWrapperConstrained}>
                        <NotionEditor
                          value={(angle[field.key] as string) || ''}
                          onSave={handleSave(angle.id, field.key)}
                          onStatusChange={handleStatusChange(angle.id, field.key)}
                          hideStatusIndicator
                          placeholder={field.placeholder}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}

      {/* Add angle */}
      <div className={styles.angleAddRow}>
        <input
          className={styles.angleAddInput}
          placeholder="New angle name..."
          value={newAngleName}
          onChange={(e) => setNewAngleName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
        />
        <button
          type="button"
          className={`${styles.angleAddBtn} ${canAdd ? styles.angleAddBtnActive : ''}`}
          onClick={handleAdd}
          disabled={!canAdd || addLoading}
        >
          <Plus size={14} />
          {addLoading ? 'Adding...' : 'Add'}
        </button>
      </div>
    </>
  );
}
