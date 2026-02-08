'use client';

import { useState, useEffect } from 'react';
import { App, Modal, Form, Input, Select } from 'antd';
import type { Product, TrackerUser } from '@/types/marketing-tracker';
import { FormRichEditor } from '@/components/ui/FormRichEditor';
import modalStyles from '@/styles/components/modal.module.css';

/** 24 subtle product colors inspired by VitaLiv product packaging */
const PRODUCT_COLORS = [
  '#c4926e', '#d4a878', '#a08060', // warm amber, golden honey, coffee
  '#9e8872', '#8a7e65', '#a0846b', // taupe, mocha, terracotta
  '#7580a8', '#6b8fa3', '#5a7e98', // muted indigo, steel blue, ocean
  '#5a9a78', '#6ba088', '#7a9e7a', // sage emerald, eucalyptus, soft sage
  '#559487', '#88a070', '#6b7e6b', // teal, olive, forest
  '#8a6b9a', '#7b70a0', '#9a80a8', // berry, soft violet, lavender
  '#b88099', '#c49898', '#a88090', // dusty rose, blush, mauve
  '#5a6570', '#788580', '#8a94a8', // slate, sage gray, periwinkle
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
      className={`${modalStyles.modal} ${modalStyles.formDialog}`}
    >
      <div className={modalStyles.dialogHeader}>
        <div className={modalStyles.dialogTitle}>
          {isEdit ? 'Edit product' : 'New product'}
        </div>
        <div className={modalStyles.dialogSubtitle}>
          {isEdit ? 'Update product details.' : 'Add a new product to the system.'}
        </div>
      </div>

      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        <div className={modalStyles.formGrid}>
          <Form.Item
            label={<span className={modalStyles.formLabel}>Name</span>}
            name="name"
            rules={[{ required: true, message: 'Product name is required' }]}
          >
            <Input placeholder="e.g. Flex Repair" />
          </Form.Item>

          <Form.Item
            label={<span className={modalStyles.formLabel}>SKU</span>}
            name="sku"
          >
            <Input placeholder="e.g. VL-FR-001" />
          </Form.Item>

          <Form.Item
            label={<span className={modalStyles.formLabel}>Product owner</span>}
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

          <Form.Item label={<span className={modalStyles.formLabel}>Color</span>}>
            <div className={modalStyles.colorGrid}>
              {PRODUCT_COLORS.map(color => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setSelectedColor(selectedColor === color ? null : color)}
                  className={`${modalStyles.colorSwatch} ${selectedColor === color ? modalStyles.colorSwatchSelected : ''}`}
                  style={{ background: color }}
                />
              ))}
            </div>
          </Form.Item>

          <Form.Item
            label={<span className={modalStyles.formLabel}>Description</span>}
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
