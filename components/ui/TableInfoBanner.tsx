import { TriangleAlert } from 'lucide-react';

interface TableInfoBannerProps {
  message: string;
}

/**
 * Small amber info banner displayed above data tables.
 * Used for threshold warnings, incomplete data notices, etc.
 */
export function TableInfoBanner({ message }: TableInfoBannerProps) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 12px',
        background: '#fffbeb',
        border: '1px solid #fef3c7',
        borderRadius: '6px',
        fontSize: '13px',
        color: '#92400e',
      }}>
        <TriangleAlert size={14} style={{ color: '#f59e0b', flexShrink: 0 }} />
        <span style={{ fontWeight: 500 }}>{message}</span>
      </div>
    </div>
  );
}
