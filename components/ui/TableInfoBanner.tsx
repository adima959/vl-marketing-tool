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
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', flexWrap: 'wrap', marginBottom: '6px' }}>
      {messages.map((msg) => (
        <div key={msg} style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '2px 8px',
          background: '#fffbeb',
          border: '1px solid #fef3c7',
          borderRadius: '4px',
          fontSize: '11px',
          color: '#92400e',
        }}>
          <TriangleAlert size={12} style={{ color: '#f59e0b', flexShrink: 0 }} />
          <span style={{ fontWeight: 500 }}>{msg}</span>
        </div>
      ))}
    </div>
  );
}
