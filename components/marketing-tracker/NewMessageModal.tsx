'use client';

import { useState, useEffect, useMemo } from 'react';
import { Modal, Form, Input, Select } from 'antd';
import { usePipelineStore } from '@/stores/pipelineStore';
import modalStyles from '@/styles/components/modal.module.css';

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

  const angleOptions = [
    ...filteredAngles.map(a => ({ value: a.id, label: a.name })),
    { value: NEW_ANGLE_VALUE, label: '+ Create new angle' },
  ];

  const handleSubmit = async (values: MessageFormValues) => {
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
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <Form.Item
            name="name"
            label="Message Name"
            rules={[{ required: true, message: 'Name is required' }]}
            style={{ gridColumn: '1 / -1' }}
          >
            <Input placeholder="e.g., Morning Routine Hook v1" />
          </Form.Item>

          <Form.Item
            name="productId"
            label="Product"
            rules={[{ required: true, message: 'Select a product' }]}
          >
            <Select
              options={products.map(p => ({ value: p.id, label: p.name }))}
              placeholder="Select product"
            />
          </Form.Item>

          <Form.Item
            name="angleId"
            label="Angle"
            rules={[{ required: true, message: 'Select or create an angle' }]}
          >
            <Select
              options={angleOptions}
              placeholder={selectedProductId ? 'Select angle' : 'Select product first'}
              disabled={!selectedProductId}
            />
          </Form.Item>

          {selectedAngleId === NEW_ANGLE_VALUE && (
            <Form.Item
              name="newAngleName"
              label="New Angle Name"
              rules={[{ required: true, message: 'Angle name is required' }]}
              style={{ gridColumn: '1 / -1' }}
            >
              <Input placeholder="e.g., Joint Pain Relief" />
            </Form.Item>
          )}
        </div>
      </Form>
    </Modal>
  );
}
