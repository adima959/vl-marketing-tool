'use client';

import { useState, useEffect } from 'react';
import { App, Modal, Form, Input, Select } from 'antd';
import type { Creative, Geography, CreativeFormat } from '@/types';
import { GEO_CONFIG, CREATIVE_FORMAT_CONFIG } from '@/types';
import { usePipelineStore } from '@/stores/pipelineStore';
import { FormRichEditor } from '@/components/ui/FormRichEditor';
import modalStyles from '@/styles/components/modal.module.css';

interface CreativeModalProps {
  open: boolean;
  onClose: () => void;
  messageId: string;
  // Legacy props for marketing-tracker pages (direct API calls)
  onSuccess?: () => void;
  creative?: Creative | null;
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

export function CreativeModal({ open, onClose, messageId, onSuccess, creative }: CreativeModalProps) {
  const [form] = Form.useForm<CreativeFormValues>();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const { addCreative } = usePipelineStore();
  const isEdit = !!creative;
  const isLegacy = !!onSuccess;

  useEffect(() => {
    if (open) {
      if (creative) {
        form.setFieldsValue({
          name: creative.name, geo: creative.geo, format: creative.format,
          cta: creative.cta || '', url: creative.url || '', notes: creative.notes || '',
        });
      } else {
        form.resetFields();
      }
    }
  }, [open, creative, form]);

  const handleSubmit = async (values: CreativeFormValues) => {
    setLoading(true);
    try {
      if (isLegacy) {
        // Legacy path: direct API call for marketing-tracker pages
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
        if (!data.success) throw new Error(data.error || 'Failed to save creative');
        message.success(isEdit ? 'Creative updated' : 'Creative created');
        onSuccess();
      } else {
        // Pipeline path: use store action
        await addCreative(messageId, {
          geo: values.geo, name: values.name.trim(), format: values.format,
          cta: values.cta, url: values.url, notes: values.notes,
        });
      }
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
      width={560}
      className={modalStyles.modal}
    >
      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Please enter a creative name' }]}>
            <Input placeholder="e.g., UGC Testimonial — Norway" />
          </Form.Item>
          <Form.Item name="geo" label="Geography" rules={[{ required: true, message: 'Please select a geography' }]}>
            <Select options={geoOptions} placeholder="Select geography" />
          </Form.Item>
          <Form.Item name="format" label="Format" rules={[{ required: true, message: 'Please select a format' }]}>
            <Select options={formatOptions} placeholder="Select format" />
          </Form.Item>
          <Form.Item name="cta" label="Call to Action">
            <Input placeholder="e.g., Shop Now, Learn More" />
          </Form.Item>
          <Form.Item name="url" label="URL" style={{ gridColumn: '1 / -1' }}>
            <Input placeholder="https://..." />
          </Form.Item>
          <Form.Item name="notes" label="Notes" style={{ gridColumn: '1 / -1' }}>
            <FormRichEditor placeholder="Internal notes..." />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
}
