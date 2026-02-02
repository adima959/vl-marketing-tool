'use client';

import { useState, useEffect } from 'react';
import { Modal, Form, Input, Select, message } from 'antd';
import type { Angle, AngleStatus } from '@/types';

const { TextArea } = Input;

interface AngleModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  productId: string;
  angle?: Angle | null; // If provided, edit mode
}

interface AngleFormValues {
  name: string;
  description?: string;
  status: AngleStatus;
}

const statusOptions = [
  { value: 'idea', label: 'Idea' },
  { value: 'in_production', label: 'In Production' },
  { value: 'live', label: 'Live' },
  { value: 'paused', label: 'Paused' },
  { value: 'retired', label: 'Retired' },
];

export function AngleModal({ open, onClose, onSuccess, productId, angle }: AngleModalProps) {
  const [form] = Form.useForm<AngleFormValues>();
  const [loading, setLoading] = useState(false);
  const isEdit = !!angle;

  useEffect(() => {
    if (open) {
      if (angle) {
        form.setFieldsValue({
          name: angle.name,
          description: angle.description || '',
          status: angle.status,
        });
      } else {
        form.resetFields();
        form.setFieldValue('status', 'idea');
      }
    }
  }, [open, angle, form]);

  const handleSubmit = async (values: AngleFormValues) => {
    setLoading(true);
    try {
      const url = isEdit
        ? `/api/marketing-tracker/angles/${angle.id}`
        : '/api/marketing-tracker/angles';

      const body = isEdit ? values : { ...values, productId };

      const response = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to save angle');
      }

      message.success(isEdit ? 'Angle updated successfully' : 'Angle created successfully');
      onSuccess();
      onClose();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Failed to save angle');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={isEdit ? 'Edit Angle' : 'New Angle'}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText={isEdit ? 'Save Changes' : 'Create Angle'}
      confirmLoading={loading}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        style={{ marginTop: 16 }}
      >
        <Form.Item
          name="name"
          label="Angle Name"
          rules={[{ required: true, message: 'Please enter an angle name' }]}
        >
          <Input placeholder="e.g., Joint Pain & Daily Life" />
        </Form.Item>

        <Form.Item
          name="description"
          label="Description"
        >
          <TextArea
            placeholder="Brief description of the problem area..."
            rows={3}
          />
        </Form.Item>

        <Form.Item
          name="status"
          label="Status"
          rules={[{ required: true }]}
        >
          <Select options={statusOptions} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
