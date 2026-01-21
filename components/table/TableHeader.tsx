import { Button } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import styles from './TableHeader.module.css';

interface TableHeaderProps {
  onColumnSettings: () => void;
}

export function TableHeader({ onColumnSettings }: TableHeaderProps) {
  return (
    <div className={styles.header}>
      <Button
        type="default"
        icon={<SettingOutlined />}
        onClick={onColumnSettings}
        size="middle"
      >
        Column Settings
      </Button>
    </div>
  );
}
