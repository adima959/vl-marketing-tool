'use client';

import { useState, useEffect } from 'react';
import { App, Modal, Form, Input, Select } from 'antd';
import type { Product, TrackerUser } from '@/types';
import { FormRichEditor } from '@/components/ui/FormRichEditor';
import modalStyles from '@/styles/components/modal.module.css';

/** 20 curated product colors derived from the design system palette */
const PRODUCT_COLORS = [
  '#3b82f6', '#2563eb', '#6366f1', '#8b5cf6', '#a855f7',
  '#d946ef', '#ec4899', '#ef4444', '#f97316', '#f59e0b',
  '#eab308', '#84cc16', '#22c55e', '#10b981', '#00B96B',
  '#14b8a6', '#06b6d4', '#0ea5e9', '#6b7280', '#374151',
];

interface ProductModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  product?: Product | null;
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
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const isEdit = !!product;

  useEffect(() => {
    if (open) {
      if (product) {
        form.setFieldsValue({
          name: product.name,
          description: product.description || '',
          notes: product.notes || '',
          ownerId: product.ownerId ?? undefined,
        });
        setSelectedColor(product.color || null);
      } else {
        form.resetFields();
        setSelectedColor(null);
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
        body: JSON.stringify({ ...values, color: selectedColor }),
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
      destroyOnHidden
      width={560}
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
            label="Product Name"
            rules={[{ required: true, message: 'Please enter a product name' }]}
          >
            <Input placeholder="e.g., Flex Repair, Sleep Repair" />
          </Form.Item>

          <Form.Item
            name="ownerId"
            label="Owner"
            rules={[]}
          >
            <Select
              placeholder="Select owner"
              options={users.map(user => ({
                value: user.id,
                label: user.name,
              }))}
            />
          </Form.Item>

          <Form.Item label="Color" style={{ gridColumn: '1 / -1' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {PRODUCT_COLORS.map(color => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setSelectedColor(selectedColor === color ? null : color)}
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 4,
                    border: selectedColor === color ? '2px solid var(--color-gray-900)' : '2px solid transparent',
                    background: color,
                    cursor: 'pointer',
                    padding: 0,
                    outline: 'none',
                    boxShadow: selectedColor === color ? '0 0 0 1px var(--color-background-primary)' : 'none',
                  }}
                />
              ))}
            </div>
          </Form.Item>

          <Form.Item name="description" label="Description" style={{ gridColumn: '1 / -1' }}>
            <FormRichEditor placeholder="Product description..." />
          </Form.Item>

          <Form.Item name="notes" label="Notes" style={{ gridColumn: '1 / -1' }}>
            <FormRichEditor placeholder="Internal notes, pricing info, etc." />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
}
