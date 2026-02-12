'use client';

import { Button, Modal } from 'antd';
import { EditOutlined, ExportOutlined, DeleteOutlined } from '@ant-design/icons';
import { sanitizeHtml } from '@/lib/sanitize';
import { AssetTypeIcon } from '@/components/marketing-tracker';
import modalStyles from '@/styles/components/modal.module.css';
import { GEO_CONFIG, type Asset } from '@/types';
import styles from './page.module.css';

interface AssetDetailModalProps {
  asset: Asset | null;
  open: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: (assetId: string) => void;
  formatDate: (dateString?: string) => string;
  modal: ReturnType<typeof import('antd').App.useApp>['modal'];
}

export function AssetDetailModal({
  asset,
  open,
  onClose,
  onEdit,
  onDelete,
  formatDate,
  modal,
}: AssetDetailModalProps): React.ReactNode {
  return (
    <Modal
      title={asset?.name}
      open={open}
      onCancel={onClose}
      className={modalStyles.modal}
      footer={[
        asset?.url && (
          <Button key="open" type="primary" icon={<ExportOutlined />} href={asset.url} target="_blank">
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
          onClick={() => asset && modal.confirm({
            title: 'Delete Asset',
            content: `Are you sure you want to delete "${asset.name}"?`,
            okText: 'Delete',
            okType: 'danger',
            onOk: () => onDelete(asset.id),
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
      {asset && (
        <div className={styles.modalContent}>
          <div className={styles.modalMeta}>
            <div className={styles.modalMetaItem}>
              <span className={styles.metaLabel}>Type</span>
              <span className={styles.metaValue}>
                <AssetTypeIcon type={asset.type} showLabel />
              </span>
            </div>
            <div className={styles.modalMetaItem}>
              <span className={styles.metaLabel}>Geography</span>
              <span className={styles.metaValue}>
                {GEO_CONFIG[asset.geo].flag} {GEO_CONFIG[asset.geo].label}
              </span>
            </div>
            <div className={styles.modalMetaItem}>
              <span className={styles.metaLabel}>Created</span>
              <span className={styles.metaValue}>{formatDate(asset.createdAt)}</span>
            </div>
          </div>

          {asset.url && (
            <div className={styles.modalSection}>
              <h4 className={styles.modalSectionTitle}>URL</h4>
              <a href={asset.url} target="_blank" rel="noopener noreferrer" className={styles.modalUrl}>
                {asset.url}
              </a>
            </div>
          )}

          {asset.content && (
            <div className={styles.modalSection}>
              <h4 className={styles.modalSectionTitle}>Content</h4>
              <div className={styles.modalContentText} dangerouslySetInnerHTML={{ __html: sanitizeHtml(asset.content) }} />
            </div>
          )}

          {asset.notes && (
            <div className={styles.modalSection}>
              <h4 className={styles.modalSectionTitle}>Notes</h4>
              <p className={styles.modalNotes}>{asset.notes}</p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
