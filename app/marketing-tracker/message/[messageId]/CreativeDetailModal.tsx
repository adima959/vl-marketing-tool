'use client';

import { Button, Modal } from 'antd';
import { EditOutlined, ExportOutlined, DeleteOutlined } from '@ant-design/icons';
import modalStyles from '@/styles/components/modal.module.css';
import { GEO_CONFIG, CREATIVE_FORMAT_CONFIG, type Creative } from '@/types';
import styles from './page.module.css';

interface CreativeDetailModalProps {
  creative: Creative | null;
  open: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: (creativeId: string) => void;
  formatDate: (dateString?: string) => string;
  modal: ReturnType<typeof import('antd').App.useApp>['modal'];
}

export function CreativeDetailModal({
  creative,
  open,
  onClose,
  onEdit,
  onDelete,
  formatDate,
  modal,
}: CreativeDetailModalProps): React.ReactNode {
  return (
    <Modal
      title={creative?.name}
      open={open}
      onCancel={onClose}
      className={modalStyles.modal}
      footer={[
        creative?.url && (
          <Button key="open" type="primary" icon={<ExportOutlined />} href={creative.url} target="_blank">
            Open Link
          </Button>
        ),
        <Button key="edit" icon={<EditOutlined />} onClick={onEdit}>
          Edit
        </Button>,
        <Button
          key="delete"
          danger
          icon={<DeleteOutlined />}
          onClick={() => creative && modal.confirm({
            title: 'Delete Creative',
            content: `Are you sure you want to delete "${creative.name}"?`,
            okText: 'Delete',
            okType: 'danger',
            onOk: () => onDelete(creative.id),
          })}
        >
          Delete
        </Button>,
        <Button key="close" onClick={onClose}>
          Close
        </Button>,
      ]}
      width={600}
    >
      {creative && (
        <div className={styles.modalContent}>
          <div className={styles.modalMeta}>
            <div className={styles.modalMetaItem}>
              <span className={styles.metaLabel}>Format</span>
              <span className={styles.metaValue}>{CREATIVE_FORMAT_CONFIG[creative.format].label}</span>
            </div>
            <div className={styles.modalMetaItem}>
              <span className={styles.metaLabel}>Geography</span>
              <span className={styles.metaValue}>
                {GEO_CONFIG[creative.geo].flag} {GEO_CONFIG[creative.geo].label}
              </span>
            </div>
            <div className={styles.modalMetaItem}>
              <span className={styles.metaLabel}>CTA</span>
              <span className={styles.metaValue}>{creative.cta || '-'}</span>
            </div>
            <div className={styles.modalMetaItem}>
              <span className={styles.metaLabel}>Created</span>
              <span className={styles.metaValue}>{formatDate(creative.createdAt)}</span>
            </div>
          </div>

          {creative.url && (
            <div className={styles.modalSection}>
              <h4 className={styles.modalSectionTitle}>URL</h4>
              <a href={creative.url} target="_blank" rel="noopener noreferrer" className={styles.modalUrl}>
                {creative.url}
              </a>
            </div>
          )}

          {creative.notes && (
            <div className={styles.modalSection}>
              <h4 className={styles.modalSectionTitle}>Notes</h4>
              <p className={styles.modalNotes}>{creative.notes}</p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
