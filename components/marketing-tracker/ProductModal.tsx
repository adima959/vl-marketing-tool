'use client';

import { useState, useEffect } from 'react';
import { Modal, Form, Input, Select, message } from 'antd';
import type { Product, TrackerUser } from '@/types';

const { TextArea } = Input;

interface ProductModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  product?: Product | null; // If provided, edit mode
  users: TrackerUser[];
}

interface ProductFormValues {
  name: string;
  description?: string;
  notes?: string;
  ownerId: string;
}

export function ProductModal({ open, onClose, onSuccess, product, users }: ProductModalProps) {
  const [form] = Form.useForm<ProductFormValues>();
  const [loading, setLoading] = useState(false);
  const isEdit = !!product;

  useEffect(() => {
    if (open) {
      if (product) {
        form.setFieldsValue({
          name: product.name,
          description: product.description || '',
          notes: product.notes || '',
          ownerId: product.ownerId,
        });
      } else {
        form.resetFields();
        // Default to first user if available
        if (users.length > 0) {
          form.setFieldValue('ownerId', users[0].id);
        }
      }
    }
  }, [open, product, form, users]);

  const handleSubmit = async (values: ProductFormValues) => {
    setLoading(true);
    try {
      const url = isEdit
        ? `/api/marketing-tracker/products/${product.id}`
        : '/api/marketing-tracker/products';

      const response = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to save product');
      }

      message.success(isEdit ? 'Product updated successfully' : 'Product created successfully');
      onSuccess();
      onClose();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Failed to save product');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={isEdit ? 'Edit Product' : 'New Product'}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText={isEdit ? 'Save Changes' : 'Create Product'}
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
          label="Product Name"
          rules={[{ required: true, message: 'Please enter a product name' }]}
        >
          <Input placeholder="e.g., Flex Repair, Sleep Repair" />
        </Form.Item>

        <Form.Item
          name="description"
          label="Description"
        >
          <TextArea
            placeholder="Product description..."
            rows={3}
          />
        </Form.Item>

        <Form.Item
          name="notes"
          label="Notes"
        >
          <TextArea
            placeholder="Internal notes, pricing info, etc."
            rows={2}
          />
        </Form.Item>

        <Form.Item
          name="ownerId"
          label="Owner"
          rules={[{ required: true, message: 'Please select an owner' }]}
        >
          <Select
            placeholder="Select owner"
            options={users.map(user => ({
              value: user.id,
              label: user.name,
            }))}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
