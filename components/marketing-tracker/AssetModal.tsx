'use client';

import { useState, useEffect } from 'react';
import { Modal, Form, Input, Select, message } from 'antd';
import type { Asset, Geography, AssetType } from '@/types';
import { GEO_CONFIG, ASSET_TYPE_CONFIG } from '@/types';

const { TextArea } = Input;

interface AssetModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  messageId: string;
  asset?: Asset | null; // If provided, edit mode
}

interface AssetFormValues {
  name: string;
  geo: Geography;
  type: AssetType;
  url?: string;
  content?: string;
  notes?: string;
}

const geoOptions = Object.entries(GEO_CONFIG).map(([value, config]) => ({
  value,
  label: `${config.flag} ${config.label}`,
}));

const typeOptions = Object.entries(ASSET_TYPE_CONFIG).map(([value, config]) => ({
  value,
  label: config.label,
}));

export function AssetModal({ open, onClose, onSuccess, messageId, asset }: AssetModalProps) {
  const [form] = Form.useForm<AssetFormValues>();
  const [loading, setLoading] = useState(false);
  const isEdit = !!asset;

  useEffect(() => {
    if (open) {
      if (asset) {
        form.setFieldsValue({
          name: asset.name,
          geo: asset.geo,
          type: asset.type,
          url: asset.url || '',
          content: asset.content || '',
          notes: asset.notes || '',
        });
      } else {
        form.resetFields();
      }
    }
  }, [open, asset, form]);

  const handleSubmit = async (values: AssetFormValues) => {
    setLoading(true);
    try {
      const url = isEdit
        ? `/api/marketing-tracker/assets/${asset.id}`
        : '/api/marketing-tracker/assets';

      const body = isEdit ? values : { ...values, messageId };

      const response = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to save asset');
      }

      message.success(isEdit ? 'Asset updated' : 'Asset created');
      onSuccess();
      onClose();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Failed to save asset');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={isEdit ? 'Edit Asset' : 'New Asset'}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText={isEdit ? 'Save Changes' : 'Create Asset'}
      confirmLoading={loading}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        style={{ marginTop: 16 }}
      >
        <Form.Item
          name="name"
          label="Name"
          rules={[{ required: true, message: 'Please enter an asset name' }]}
        >
          <Input placeholder="e.g., Landing page v2 — Norway" />
        </Form.Item>

        <Form.Item
          name="geo"
          label="Geography"
          rules={[{ required: true, message: 'Please select a geography' }]}
        >
          <Select options={geoOptions} placeholder="Select geography" />
        </Form.Item>

        <Form.Item
          name="type"
          label="Asset Type"
          rules={[{ required: true, message: 'Please select an asset type' }]}
        >
          <Select options={typeOptions} placeholder="Select type" />
        </Form.Item>

        <Form.Item name="url" label="URL">
          <Input placeholder="https://..." />
        </Form.Item>

        <Form.Item name="content" label="Content">
          <TextArea rows={3} placeholder="Asset content or copy..." />
        </Form.Item>

        <Form.Item name="notes" label="Notes">
          <TextArea rows={2} placeholder="Internal notes..." />
        </Form.Item>
      </Form>
    </Modal>
  );
}
