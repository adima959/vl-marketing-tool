import { Button } from 'antd';
import {
  ExportOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import styles from './TableFooter.module.css';

interface TableFooterProps {
  onColumnSettings: () => void;
}

export function TableFooter({ onColumnSettings }: TableFooterProps) {
  const handleExport = () => {
    // TODO: Implement export
    console.log('Export clicked');
  };

  return (
    <div className={styles.footer}>
      <Button type="text" icon={<ExportOutlined />} size="middle">
        Export
      </Button>
      <Button type="text" icon={<SettingOutlined />} onClick={onColumnSettings} size="middle">
        Column Settings
      </Button>
    </div>
  );
}
