'use client';

import { useState, useEffect } from 'react';
import { Modal, Form, Input, Select } from 'antd';
import type { Campaign, Channel, Geography } from '@/types';
import { CHANNEL_CONFIG, GEO_CONFIG } from '@/types';
import { usePipelineStore } from '@/stores/pipelineStore';
import modalStyles from '@/styles/components/modal.module.css';

interface CampaignModalProps {
  open: boolean;
  onClose: () => void;
  messageId: string;
  campaign?: Campaign | null;
  defaultGeo?: Geography;
}

interface CampaignFormValues {
  channel: Channel;
  geo: Geography;
  externalId?: string;
  externalUrl?: string;
}

const channelOptions = Object.entries(CHANNEL_CONFIG).map(([value, config]) => ({
  value,
  label: config.label,
}));

const geoOptions = Object.entries(GEO_CONFIG).map(([value, config]) => ({
  value,
  label: `${config.flag} ${config.label}`,
}));

export function CampaignModal({ open, onClose, messageId, campaign, defaultGeo }: CampaignModalProps) {
  const [form] = Form.useForm<CampaignFormValues>();
  const [loading, setLoading] = useState(false);
  const { addCampaign, updateCampaign } = usePipelineStore();
  const isEdit = !!campaign;

  useEffect(() => {
    if (open) {
      if (campaign) {
        form.setFieldsValue({
          channel: campaign.channel,
          geo: campaign.geo,
          externalId: campaign.externalId || '',
          externalUrl: campaign.externalUrl || '',
        });
      } else {
        form.resetFields();
        if (defaultGeo) form.setFieldValue('geo', defaultGeo);
      }
    }
  }, [open, campaign, form, defaultGeo]);

  const handleSubmit = async (values: CampaignFormValues) => {
    setLoading(true);
    if (isEdit) {
      await updateCampaign(campaign.id, {
        channel: values.channel,
        geo: values.geo,
        externalId: values.externalId,
        externalUrl: values.externalUrl,
      });
    } else {
      await addCampaign(messageId, {
        channel: values.channel,
        geo: values.geo,
        externalId: values.externalId,
        externalUrl: values.externalUrl,
      });
    }
    setLoading(false);
    onClose();
  };

  return (
    <Modal
      title={isEdit ? 'Edit Campaign' : 'New Campaign'}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText={isEdit ? 'Update' : 'Create Campaign'}
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
            name="channel"
            label="Channel"
            rules={[{ required: true, message: 'Please select a channel' }]}
          >
            <Select options={channelOptions} placeholder="Select channel" />
          </Form.Item>

          <Form.Item
            name="geo"
            label="Geography"
            rules={[{ required: true, message: 'Please select a geography' }]}
          >
            <Select options={geoOptions} placeholder="Select geography" />
          </Form.Item>

          <Form.Item name="externalId" label="External ID">
            <Input placeholder="e.g., FR_JP_Car_Meta_NO_v1" />
          </Form.Item>

          <Form.Item name="externalUrl" label="External URL">
            <Input placeholder="Link to campaign in ad platform..." />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
}
