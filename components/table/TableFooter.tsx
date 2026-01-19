import { Button } from 'antd';
import {
  ExportOutlined,
  SettingOutlined,
} from '@ant-design/icons';

interface TableFooterProps {
  onColumnSettings: () => void;
}

export function TableFooter({ onColumnSettings }: TableFooterProps) {
  const handleExport = () => {
    // TODO: Implement export
    console.log('Export clicked');
  };

  return (
    <div
      style={{
        padding: '12px 16px',
        backgroundColor: '#fff',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
        display: 'flex',
        gap: 12,
      }}
    >
      <Button type="text" icon={<ExportOutlined />} size="middle">
        Export
      </Button>
      <Button type="text" icon={<SettingOutlined />} onClick={onColumnSettings} size="middle">
        Column Settings
      </Button>
    </div>
  );
}
