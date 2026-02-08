'use client';

import { useState } from 'react';
import { App, Modal, Radio, Select, Typography } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import modalStyles from '@/styles/components/modal.module.css';

const { Text } = Typography;

type EntityType = 'product' | 'angle' | 'message';

interface DeleteConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  entityType: EntityType;
  entityId: string;
  entityName: string;
  childCount: number;
  childLabel: string;
  moveTargets: { id: string; name: string }[];
}

const ENTITY_ENDPOINTS: Record<EntityType, string> = {
  product: 'products',
  angle: 'angles',
  message: 'messages',
};

export function DeleteConfirmModal({
  open,
  onClose,
  onSuccess,
  entityType,
  entityId,
  entityName,
  childCount,
  childLabel,
  moveTargets,
}: DeleteConfirmModalProps) {
  const { message } = App.useApp();
  const [mode, setMode] = useState<'cascade' | 'move'>('cascade');
  const [targetId, setTargetId] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  const hasChildren = childCount > 0;
  const canMove = moveTargets.length > 0;

  const handleDelete = async () => {
    if (mode === 'move' && !targetId) {
      message.error(`Please select a target ${entityType} to move ${childLabel} to`);
      return;
    }

    setLoading(true);
    try {
      const endpoint = ENTITY_ENDPOINTS[entityType];
      const body: Record<string, string> = hasChildren
        ? mode === 'cascade'
          ? { mode: 'cascade' }
          : { mode: 'move', targetParentId: targetId! }
        : { mode: 'cascade' };

      const response = await fetch(`/api/marketing-tracker/${endpoint}/${entityId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      if (!data.success) throw new Error(data.error || `Failed to delete ${entityType}`);

      message.success(
        mode === 'move' && hasChildren
          ? `${childLabel.charAt(0).toUpperCase() + childLabel.slice(1)} moved and ${entityType} deleted`
          : `${entityType.charAt(0).toUpperCase() + entityType.slice(1)} deleted`
      );
      onSuccess();
      handleClose();
    } catch (error) {
      message.error(error instanceof Error ? error.message : `Failed to delete ${entityType}`);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setMode('cascade');
    setTargetId(undefined);
    onClose();
  };

  return (
    <Modal
      title={
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />
          Delete {entityName}?
        </span>
      }
      open={open}
      onCancel={handleClose}
      onOk={handleDelete}
      okText="Delete"
      okType="danger"
      okButtonProps={{ disabled: mode === 'move' && !targetId }}
      confirmLoading={loading}
      destroyOnHidden
      width={480}
      className={modalStyles.modal}
    >
      <div style={{ marginTop: 16 }}>
        {hasChildren ? (
          <>
            <Text style={{ display: 'block', marginBottom: 16 }}>
              This {entityType} has <strong>{childCount} {childLabel}</strong>.
              What would you like to do with them?
            </Text>

            <Radio.Group
              value={mode}
              onChange={(e) => {
                setMode(e.target.value);
                setTargetId(undefined);
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
            >
              <Radio value="cascade">
                <div>
                  <Text strong>Delete everything</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Remove this {entityType} and all {childCount} {childLabel}
                  </Text>
                </div>
              </Radio>

              <Radio value="move" disabled={!canMove}>
                <div>
                  <Text strong style={!canMove ? { color: 'rgba(0,0,0,0.25)' } : undefined}>
                    Move {childLabel} first
                  </Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {canMove
                      ? `Move all ${childLabel} to another ${entityType}, then delete this one`
                      : `No other ${entityType}s available to move to`}
                  </Text>
                </div>
              </Radio>
            </Radio.Group>

            {mode === 'move' && canMove && (
              <div style={{ marginTop: 12, marginLeft: 24 }}>
                <Select
                  placeholder={`Select target ${entityType}...`}
                  value={targetId}
                  onChange={setTargetId}
                  options={moveTargets.map((t) => ({ value: t.id, label: t.name }))}
                  style={{ width: '100%' }}
                />
              </div>
            )}
          </>
        ) : (
          <Text>
            Are you sure you want to delete <strong>{entityName}</strong>?
            This action cannot be undone.
          </Text>
        )}
      </div>
    </Modal>
  );
}
