'use client';

import { useState, useEffect } from 'react';
import { App, Modal, Form, Input, Select } from 'antd';
import type { Message, AngleStatus } from '@/types';
import { FormRichEditor } from '@/components/ui/FormRichEditor';
import modalStyles from '@/styles/components/modal.module.css';

const { TextArea } = Input;

interface MessageModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  angleId: string;
  message?: Message | null; // If provided, edit mode
}

interface MessageFormValues {
  name: string;
  description?: string;
  specificPainPoint?: string;
  corePromise?: string;
  keyIdea?: string;
  primaryHookDirection?: string;
  headlines?: string;
  status: AngleStatus;
}

const statusOptions = [
  { value: 'idea', label: 'Idea' },
  { value: 'in_production', label: 'In Production' },
  { value: 'live', label: 'Live' },
  { value: 'paused', label: 'Paused' },
  { value: 'retired', label: 'Retired' },
];

export function MessageModal({ open, onClose, onSuccess, angleId, message: msg }: MessageModalProps) {
  const [form] = Form.useForm<MessageFormValues>();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const isEdit = !!msg;

  useEffect(() => {
    if (open) {
      if (msg) {
        form.setFieldsValue({
          name: msg.name,
          description: msg.description || '',
          specificPainPoint: msg.specificPainPoint || '',
          corePromise: msg.corePromise || '',
          keyIdea: msg.keyIdea || '',
          primaryHookDirection: msg.primaryHookDirection || '',
          headlines: msg.headlines?.join('\n') || '',
          status: msg.status,
        });
      } else {
        form.resetFields();
        form.setFieldValue('status', 'idea');
      }
    }
  }, [open, msg, form]);

  const handleSubmit = async (values: MessageFormValues) => {
    setLoading(true);
    try {
      const url = isEdit
        ? `/api/marketing-tracker/messages/${msg.id}`
        : '/api/marketing-tracker/messages';

      // Convert headlines from newline-separated string to array
      const headlinesArray = values.headlines
        ? values.headlines.split('\n').map(h => h.trim()).filter(h => h.length > 0)
        : [];

      const body = {
        ...(isEdit ? {} : { angleId }),
        name: values.name,
        description: values.description,
        specificPainPoint: values.specificPainPoint,
        corePromise: values.corePromise,
        keyIdea: values.keyIdea,
        primaryHookDirection: values.primaryHookDirection,
        headlines: headlinesArray,
        status: values.status,
      };

      const response = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to save message');
      }

      message.success(isEdit ? 'Message updated successfully' : 'Message created successfully');
      onSuccess();
      onClose();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Failed to save message');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={isEdit ? 'Edit Message' : 'New Message'}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText={isEdit ? 'Save Changes' : 'Create Message'}
      confirmLoading={loading}
      destroyOnHidden
      width={640}
      className={modalStyles.modal}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        style={{ marginTop: 16 }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <Form.Item
            name="name"
            label="Message Name"
            rules={[{ required: true, message: 'Please enter a message name' }]}
          >
            <Input placeholder="e.g., Can't play with grandkids" />
          </Form.Item>

          <Form.Item
            name="status"
            label="Status"
            rules={[{ required: true }]}
          >
            <Select options={statusOptions} />
          </Form.Item>

          <Form.Item name="specificPainPoint" label="Specific Pain Point">
            <Input placeholder="What specific problem does the customer experience?" />
          </Form.Item>

          <Form.Item name="corePromise" label="Core Promise">
            <Input placeholder="What do we promise to deliver?" />
          </Form.Item>

          <Form.Item name="keyIdea" label="Key Idea">
            <Input placeholder="The central insight or hook" />
          </Form.Item>

          <Form.Item name="primaryHookDirection" label="Primary Hook Direction">
            <Input placeholder="Creative direction for hooks" />
          </Form.Item>

          <Form.Item
            name="headlines"
            label="Headlines (one per line)"
            style={{ gridColumn: '1 / -1' }}
          >
            <TextArea
              placeholder={"Keep up with your grandchildren again\nDon't let stiff joints steal these moments\nThey grow up fast. Don't miss it."}
              rows={3}
            />
          </Form.Item>

          <Form.Item
            name="description"
            label="Additional Notes"
            style={{ gridColumn: '1 / -1' }}
          >
            <FormRichEditor placeholder="Any additional context or notes..." />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
}
