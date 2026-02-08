import { TriangleAlert } from 'lucide-react';

interface TableInfoBannerProps {
  messages: string[];
}

/**
 * Small amber info banner displayed above data tables.
 * Used for threshold warnings, incomplete data notices, etc.
 * Renders multiple messages in a single row.
 */
export function TableInfoBanner({ messages }: TableInfoBannerProps) {
  if (messages.length === 0) return null;

  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
      {messages.map((msg) => (
        <div key={msg} style={{
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
          <span style={{ fontWeight: 500 }}>{msg}</span>
        </div>
      ))}
    </div>
  );
}
