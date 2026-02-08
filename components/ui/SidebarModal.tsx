'use client';

import type { ReactNode } from 'react';
import { Modal } from 'antd';
import modalStyles from '@/styles/components/modal.module.css';
import styles from './SidebarModal.module.css';

export interface SidebarModalItem {
  key: string;
  label: string;
  count?: number;
  color?: string;
}

interface SidebarModalProps {
  open: boolean;
  onClose: () => void;
  /** Modal title (used for accessibility / screen readers) */
  title: string;
  width?: number;
  /** Sidebar configuration */
  sidebar: {
    title: string;
    items: SidebarModalItem[];
    activeKey: string;
    onSelect: (key: string) => void;
  };
  /** Content pane header */
  contentTitle: string;
  contentExtra?: ReactNode;
  /** Action buttons in the content header (pushed right) */
  contentActions?: ReactNode;
  /** Main scrollable body */
  children: ReactNode;
  /** Pinned below the scrollable body (e.g. an add-row) */
  footer?: ReactNode;
}

export function SidebarModal({
  open,
  onClose,
  title,
  width = 640,
  sidebar,
  contentTitle,
  contentExtra,
  contentActions,
  children,
  footer,
}: SidebarModalProps): ReactNode {
  return (
    <Modal
      title={title}
      open={open}
      onCancel={onClose}
      footer={null}
      width={width}
      destroyOnHidden
      centered
      className={`${modalStyles.modal} ${styles.modal}`}
    >
      <div className={styles.layout}>
        {/* Sidebar */}
        <div className={styles.sidebar}>
          <div className={styles.sidebarTitle}>{sidebar.title}</div>
          <div className={styles.sidebarList}>
            {sidebar.items.map(item => {
              const isActive = item.key === sidebar.activeKey;
              return (
                <button
                  key={item.key}
                  className={`${styles.sidebarItem} ${isActive ? styles.sidebarItemActive : ''}`}
                  onClick={() => sidebar.onSelect(item.key)}
                >
                  {item.color && (
                    <span
                      className={styles.sidebarItemDot}
                      style={{ backgroundColor: item.color }}
                    />
                  )}
                  <span className={styles.sidebarItemName}>{item.label}</span>
                  {item.count != null && (
                    <span className={styles.sidebarItemCount}>{item.count}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className={styles.content}>
          <div className={styles.contentHeader}>
            <span className={styles.contentTitle}>{contentTitle}</span>
            {contentExtra && (
              <span className={styles.contentExtra}>{contentExtra}</span>
            )}
            {contentActions && (
              <div className={styles.contentActions}>{contentActions}</div>
            )}
          </div>

          <div className={styles.contentBody}>
            {children}
          </div>

          {footer && (
            <div className={styles.contentFooter}>
              {footer}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
