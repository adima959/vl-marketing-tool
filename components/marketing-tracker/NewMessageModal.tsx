'use client';

import { useState, useEffect, useMemo } from 'react';
import { Modal, Form, Input } from 'antd';
import { usePipelineStore } from '@/stores/pipelineStore';
import modalStyles from '@/styles/components/modal.module.css';
import styles from './NewMessageModal.module.css';

interface NewMessageModalProps {
  open: boolean;
  onClose: () => void;
}

interface MessageFormValues {
  name: string;
  productId: string;
  angleId: string;
  newAngleName?: string;
}

const NEW_ANGLE_VALUE = '__new__';

/* Chip selector — controlled component compatible with Ant Design Form.Item */
function ChipSelect({
  options,
  value,
  onChange,
  allowNew,
  newLabel = '+ New',
}: {
  options: { value: string; label: string }[];
  value?: string;
  onChange?: (val: string) => void;
  allowNew?: boolean;
  newLabel?: string;
}): React.ReactNode {
  return (
    <div className={styles.chipRow}>
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          className={`${styles.chip} ${value === opt.value ? styles.chipActive : ''}`}
          onClick={() => onChange?.(opt.value)}
        >
          {opt.label}
        </button>
      ))}
      {allowNew && (
        <button
          type="button"
          className={`${styles.chip} ${styles.chipNew} ${value === NEW_ANGLE_VALUE ? styles.chipActive : ''}`}
          onClick={() => onChange?.(NEW_ANGLE_VALUE)}
        >
          {newLabel}
        </button>
      )}
    </div>
  );
}

export function NewMessageModal({ open, onClose }: NewMessageModalProps) {
  const [form] = Form.useForm<MessageFormValues>();
  const [loading, setLoading] = useState(false);
  const { products, angles, createMessage, createAngle } = usePipelineStore();

  const selectedProductId = Form.useWatch('productId', form);
  const selectedAngleId = Form.useWatch('angleId', form);

  useEffect(() => {
    if (open) form.resetFields();
  }, [open, form]);

  // Reset angle when product changes
  useEffect(() => {
    if (selectedProductId) {
      form.setFieldValue('angleId', undefined);
      form.setFieldValue('newAngleName', undefined);
    }
  }, [selectedProductId, form]);

  const filteredAngles = useMemo(() => {
    if (!selectedProductId) return [];
    return angles.filter(a => a.productId === selectedProductId);
  }, [selectedProductId, angles]);

  const handleSubmit = async (values: MessageFormValues): Promise<void> => {
    setLoading(true);
    try {
      let angleId = values.angleId;

      if (angleId === NEW_ANGLE_VALUE) {
        const result = await createAngle({
          productId: values.productId,
          name: values.newAngleName!.trim(),
        });
        if (!result) {
          setLoading(false);
          return;
        }
        angleId = result.id;
      }

      await createMessage({
        angleId,
        name: values.name.trim(),
      });

      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="New Message"
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="Create"
      confirmLoading={loading}
      destroyOnHidden
      className={modalStyles.modal}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        className={styles.form}
      >
        <Form.Item
          name="name"
          label="Message Name"
          rules={[{ required: true, message: 'Name is required' }]}
        >
          <Input placeholder="e.g., Morning Routine Hook v1" />
        </Form.Item>

        <Form.Item
          name="productId"
          label="Product"
          rules={[{ required: true, message: 'Select a product' }]}
        >
          <ChipSelect
            options={products.map(p => ({ value: p.id, label: p.name }))}
          />
        </Form.Item>

        {selectedProductId && (
          <Form.Item
            name="angleId"
            label="Angle"
            rules={[{ required: true, message: 'Select or create an angle' }]}
          >
            <ChipSelect
              options={filteredAngles.map(a => ({ value: a.id, label: a.name }))}
              allowNew
              newLabel="+ New angle"
            />
          </Form.Item>
        )}

        {selectedAngleId === NEW_ANGLE_VALUE && (
          <Form.Item
            name="newAngleName"
            label="New Angle Name"
            rules={[{ required: true, message: 'Angle name is required' }]}
          >
            <Input placeholder="e.g., Joint Pain Relief" />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}
