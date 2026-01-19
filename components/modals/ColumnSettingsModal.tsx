import { Modal, Tabs, Checkbox, Table, Button, Space } from 'antd';
import type { TabsProps } from 'antd';
import { useMemo, useState, useEffect } from 'react';
import { METRIC_COLUMNS } from '@/config/columns';
import { useColumnStore } from '@/stores/columnStore';
import type { MetricColumn, MetricCategory } from '@/types';

interface ColumnSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

const CATEGORY_LABELS: Record<MetricCategory, string> = {
  basic: 'Common Metrics',
  conversions: 'Conversions',
  costs_revenue: 'Costs and Revenue',
  calculated: 'Calculated Metrics',
};

const TAB_ITEMS: { key: MetricCategory; label: string }[] = [
  { key: 'basic', label: 'Common Metrics' },
  { key: 'conversions', label: 'Conversions' },
  { key: 'costs_revenue', label: 'Costs and Revenue' },
  { key: 'calculated', label: 'Calculated Metrics' },
];

export function ColumnSettingsModal({ open, onClose }: ColumnSettingsModalProps) {
  const { visibleColumns, setVisibleColumns, resetToDefaults } = useColumnStore();
  const [localVisible, setLocalVisible] = useState<string[]>(visibleColumns);
  const [activeTab, setActiveTab] = useState<MetricCategory>('basic');

  // Sync local state when modal opens
  useEffect(() => {
    if (open) {
      setLocalVisible(visibleColumns);
    }
  }, [open, visibleColumns]);

  // Get columns for current tab
  const tabColumns = useMemo(
    () => METRIC_COLUMNS.filter((col) => col.category === activeTab),
    [activeTab]
  );

  // Toggle column visibility
  const handleToggle = (columnId: string, checked: boolean) => {
    if (checked) {
      setLocalVisible([...localVisible, columnId]);
    } else {
      setLocalVisible(localVisible.filter((id) => id !== columnId));
    }
  };

  // Save changes
  const handleSave = () => {
    setVisibleColumns(localVisible);
    onClose();
  };

  // Cancel changes
  const handleCancel = () => {
    setLocalVisible(visibleColumns);
    onClose();
  };

  // Table columns for the checkbox list
  const tableColumns = [
    {
      title: '',
      dataIndex: 'visible',
      width: 60,
      render: (_: unknown, record: MetricColumn) => (
        <Checkbox
          checked={localVisible.includes(record.id)}
          onChange={(e) => handleToggle(record.id, e.target.checked)}
        />
      ),
    },
    {
      title: <span style={{ fontWeight: 600 }}>Metric</span>,
      dataIndex: 'label',
      width: 220,
      render: (text: string) => <span style={{ fontWeight: 500 }}>{text}</span>,
    },
    {
      title: <span style={{ fontWeight: 600 }}>Column Label</span>,
      dataIndex: 'shortLabel',
      render: (text: string) => <span style={{ color: '#595959' }}>{text}</span>,
    },
  ];

  // Build tab items
  const tabItems: TabsProps['items'] = TAB_ITEMS.map((tab) => ({
    key: tab.key,
    label: tab.label,
  }));

  return (
    <Modal
      title={<span style={{ fontSize: 16, fontWeight: 600 }}>Column Settings</span>}
      open={open}
      onCancel={handleCancel}
      width={750}
      styles={{
        header: { paddingBottom: 16, borderBottom: '1px solid #f0f0f0' },
        body: { paddingTop: 24 },
      }}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Button onClick={resetToDefaults} size="middle">
            Reset to Defaults
          </Button>
          <Space size={8}>
            <Button onClick={handleCancel} size="middle">
              Cancel
            </Button>
            <Button type="primary" onClick={handleSave} size="middle">
              Save
            </Button>
          </Space>
        </div>
      }
    >
      <div style={{ display: 'flex', gap: 24 }}>
        {/* Content area */}
        <div style={{ flex: 1 }}>
          <Table
            dataSource={tabColumns}
            columns={tableColumns}
            rowKey="id"
            pagination={false}
            size="middle"
            showHeader={true}
            bordered={false}
          />
        </div>

        {/* Tab navigation (right side) */}
        <Tabs
          tabPosition="right"
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as MetricCategory)}
          items={tabItems}
          style={{ minWidth: 180 }}
        />
      </div>
    </Modal>
  );
}
