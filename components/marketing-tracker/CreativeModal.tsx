'use client';

import { useState, useEffect } from 'react';
import { Modal, Form, Input, Select, message } from 'antd';
import type { Creative, Geography, CreativeFormat } from '@/types';
import { GEO_CONFIG, CREATIVE_FORMAT_CONFIG } from '@/types';

const { TextArea } = Input;

interface CreativeModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  messageId: string;
  creative?: Creative | null; // If provided, edit mode
}

interface CreativeFormValues {
  name: string;
  geo: Geography;
  format: CreativeFormat;
  cta?: string;
  url?: string;
  notes?: string;
}

const geoOptions = Object.entries(GEO_CONFIG).map(([value, config]) => ({
  value,
  label: `${config.flag} ${config.label}`,
}));

const formatOptions = Object.entries(CREATIVE_FORMAT_CONFIG).map(([value, config]) => ({
  value,
  label: config.label,
}));

export function CreativeModal({ open, onClose, onSuccess, messageId, creative }: CreativeModalProps) {
  const [form] = Form.useForm<CreativeFormValues>();
  const [loading, setLoading] = useState(false);
  const isEdit = !!creative;

  useEffect(() => {
    if (open) {
      if (creative) {
        form.setFieldsValue({
          name: creative.name,
          geo: creative.geo,
          format: creative.format,
          cta: creative.cta || '',
          url: creative.url || '',
          notes: creative.notes || '',
        });
      } else {
        form.resetFields();
      }
    }
  }, [open, creative, form]);

  const handleSubmit = async (values: CreativeFormValues) => {
    setLoading(true);
    try {
      const url = isEdit
        ? `/api/marketing-tracker/creatives/${creative.id}`
        : '/api/marketing-tracker/creatives';

      const body = isEdit ? values : { ...values, messageId };

      const response = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to save creative');
      }

      message.success(isEdit ? 'Creative updated' : 'Creative created');
      onSuccess();
      onClose();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Failed to save creative');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={isEdit ? 'Edit Creative' : 'New Creative'}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText={isEdit ? 'Save Changes' : 'Create Creative'}
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
          rules={[{ required: true, message: 'Please enter a creative name' }]}
        >
          <Input placeholder="e.g., UGC Testimonial — Norway" />
        </Form.Item>

        <Form.Item
          name="geo"
          label="Geography"
          rules={[{ required: true, message: 'Please select a geography' }]}
        >
          <Select options={geoOptions} placeholder="Select geography" />
        </Form.Item>

        <Form.Item
          name="format"
          label="Format"
          rules={[{ required: true, message: 'Please select a format' }]}
        >
          <Select options={formatOptions} placeholder="Select format" />
        </Form.Item>

        <Form.Item name="cta" label="Call to Action">
          <Input placeholder="e.g., Shop Now, Learn More" />
        </Form.Item>

        <Form.Item name="url" label="URL">
          <Input placeholder="https://..." />
        </Form.Item>

        <Form.Item name="notes" label="Notes">
          <TextArea rows={2} placeholder="Internal notes..." />
        </Form.Item>
      </Form>
    </Modal>
  );
}
