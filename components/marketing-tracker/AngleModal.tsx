'use client';

import { Modal, Form, Input, Select } from 'antd';
import type { Angle, AngleStatus } from '@/types';
import { FormRichEditor } from '@/components/ui/FormRichEditor';
import { useEntityModal } from '@/hooks/useEntityModal';
import modalStyles from '@/styles/components/modal.module.css';

interface AngleModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  productId: string;
  angle?: Angle | null;
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
  const { form, loading, isEdit, handleSubmit } = useEntityModal<Angle, AngleFormValues>({
    open,
    entity: angle,
    onClose,
    onSuccess,
    getCreateUrl: () => '/api/marketing-tracker/angles',
    getUpdateUrl: (angle) => `/api/marketing-tracker/angles/${angle.id}`,
    entityToFormValues: (angle) => ({
      name: angle.name,
      description: angle.description || '',
      status: angle.status,
    }),
    formValuesToRequestBody: (values, isEdit) => (isEdit ? values : { ...values, productId }),
    getDefaultValues: () => ({ status: 'idea' as AngleStatus }),
    createSuccessMessage: 'Angle created successfully',
    updateSuccessMessage: 'Angle updated successfully',
    errorMessage: 'Failed to save angle',
  });

  return (
    <Modal
      title={isEdit ? 'Edit Angle' : 'New Angle'}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText={isEdit ? 'Save Changes' : 'Create Angle'}
      confirmLoading={loading}
      destroyOnHidden
      width={520}
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
            label="Angle Name"
            rules={[{ required: true, message: 'Please enter an angle name' }]}
          >
            <Input placeholder="e.g., Joint Pain & Daily Life" />
          </Form.Item>

          <Form.Item
            name="status"
            label="Status"
            rules={[{ required: true }]}
          >
            <Select options={statusOptions} />
          </Form.Item>

          <Form.Item name="description" label="Description" style={{ gridColumn: '1 / -1' }}>
            <FormRichEditor placeholder="Brief description of the problem area..." />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
}
