'use client';

import { useState, useEffect } from 'react';
import { App, Modal, Form, Input, Select } from 'antd';
import type { Product, TrackerUser } from '@/types/marketing-tracker';
import { FormRichEditor } from '@/components/ui/FormRichEditor';
import modalStyles from '@/styles/components/modal.module.css';

/** 20 curated product colors derived from the design system palette */
const PRODUCT_COLORS = [
  '#3b82f6', '#2563eb', '#6366f1', '#8b5cf6', '#a855f7',
  '#d946ef', '#ec4899', '#ef4444', '#f97316', '#f59e0b',
  '#eab308', '#84cc16', '#22c55e', '#10b981', '#00B96B',
  '#14b8a6', '#06b6d4', '#0ea5e9', '#6b7280', '#374151',
];

interface ProductDialogProps {
  product: Product | null;
  users: TrackerUser[];
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface ProductFormValues {
  name: string;
  sku?: string;
  description?: string;
  ownerId: string;
}

export function ProductDialog({ product, users, open, onClose, onSuccess }: ProductDialogProps) {
  const [form] = Form.useForm<ProductFormValues>();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);

  const isEdit = !!product;

  const handleSubmit = async (values: ProductFormValues) => {
    setLoading(true);

    try {
      const url = isEdit
        ? `/api/marketing-tracker/products/${product.id}`
        : '/api/marketing-tracker/products';

      const response = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: values.name,
          sku: values.sku || null,
          description: values.description || null,
          color: selectedColor,
          ownerId: values.ownerId,
        }),
        credentials: 'same-origin',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `Failed to ${isEdit ? 'update' : 'create'} product`);
      }

      message.success(`Product ${isEdit ? 'updated' : 'created'} successfully`);
      form.resetFields();
      onSuccess();
      onClose();
    } catch (error) {
      message.error(error instanceof Error ? error.message : `Failed to ${isEdit ? 'update' : 'create'} product`);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    form.resetFields();
    setSelectedColor(null);
    onClose();
  };

  useEffect(() => {
    if (open) {
      if (product) {
        form.setFieldsValue({
          name: product.name,
          sku: product.sku || undefined,
          description: product.description || undefined,
          ownerId: product.ownerId,
        });
        setSelectedColor(product.color || null);
      } else {
        form.resetFields();
        setSelectedColor(null);
      }
    }
  }, [product, open, form]);

  const labelStyle = { fontSize: 13, fontWeight: 500, color: 'var(--color-gray-700)' } as const;

  return (
    <Modal
      title={null}
      open={open}
      onOk={() => form.submit()}
      onCancel={handleCancel}
      confirmLoading={loading}
      okText={isEdit ? 'Update' : 'Create'}
      cancelText="Cancel"
      destroyOnHidden
      width={520}
      className={modalStyles.modal}
      styles={{
        header: { display: 'none' },
        body: { padding: '20px 24px 16px' },
        footer: { padding: '12px 24px 20px', borderTop: '1px solid var(--color-border-light)' },
      }}
    >
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-gray-900)', marginBottom: 4 }}>
          {isEdit ? 'Edit product' : 'New product'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-gray-500)' }}>
          {isEdit ? 'Update product details.' : 'Add a new product to the system.'}
        </div>
      </div>

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        style={{ marginBottom: 0 }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <Form.Item
            label={<span style={labelStyle}>Name</span>}
            name="name"
            rules={[{ required: true, message: 'Product name is required' }]}
          >
            <Input placeholder="e.g. Flex Repair" />
          </Form.Item>

          <Form.Item
            label={<span style={labelStyle}>SKU</span>}
            name="sku"
          >
            <Input placeholder="e.g. VL-FR-001" />
          </Form.Item>

          <Form.Item
            label={<span style={labelStyle}>Product owner</span>}
            name="ownerId"
            rules={[{ required: true, message: 'Product owner is required' }]}
          >
            <Select placeholder="Select owner">
              {users.map((user) => (
                <Select.Option key={user.id} value={user.id}>
                  {user.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item label={<span style={labelStyle}>Color</span>}>
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

          <Form.Item
            label={<span style={labelStyle}>Description</span>}
            name="description"
            style={{ gridColumn: '1 / -1', marginBottom: 0 }}
          >
            <FormRichEditor placeholder="Brief product description..." />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
}
