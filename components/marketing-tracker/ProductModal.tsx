'use client';

import { useState, useEffect } from 'react';
import { Modal, Form, Input, Select } from 'antd';
import type { Product, TrackerUser } from '@/types';
import { FormRichEditor } from '@/components/ui/FormRichEditor';
import { useEntityModal } from '@/hooks/useEntityModal';
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
  const [selectedColor, setSelectedColor] = useState<string | null>(null);

  const { form, loading, isEdit, handleSubmit } = useEntityModal<Product, ProductFormValues>({
    open,
    entity: product,
    onClose,
    onSuccess,
    getCreateUrl: () => '/api/marketing-tracker/products',
    getUpdateUrl: (product) => `/api/marketing-tracker/products/${product.id}`,
    entityToFormValues: (product) => ({
      name: product.name,
      description: product.description || '',
      notes: product.notes || '',
      ownerId: product.ownerId ?? '',
    }),
    formValuesToRequestBody: (values) => ({ ...values, color: selectedColor }),
    getDefaultValues: () => (users.length > 0 ? { ownerId: users[0].id } : {}),
    createSuccessMessage: 'Product created successfully',
    updateSuccessMessage: 'Product updated successfully',
    errorMessage: 'Failed to save product',
  });

  // Handle color state separately (custom UI logic)
  useEffect(() => {
    if (open) {
      setSelectedColor(product?.color || null);
    }
  }, [open, product]);

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
