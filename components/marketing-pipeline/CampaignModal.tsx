'use client';

import { useState, useEffect, useCallback } from 'react';
import { Modal, Form, Input, Select, Spin } from 'antd';
import type { Campaign, Channel, Geography } from '@/types';
import { CHANNEL_CONFIG, GEO_CONFIG } from '@/types';
import { usePipelineStore } from '@/stores/pipelineStore';
import modalStyles from '@/styles/components/modal.module.css';

interface CampaignModalProps {
  open: boolean;
  onClose: () => void;
  messageId: string;
  productId?: string;
  campaign?: Campaign | null;
  defaultGeo?: Geography;
}

interface CampaignFormValues {
  channel: Channel;
  geo: Geography;
  externalId?: string;
  externalUrl?: string;
}

interface AdCampaignOption {
  campaignId: string;
  campaignName: string;
  totalSpend: number;
  totalClicks: number;
}

const channelOptions = Object.entries(CHANNEL_CONFIG).map(([value, config]) => ({
  value,
  label: config.label,
}));

const geoOptions = Object.entries(GEO_CONFIG).map(([value, config]) => ({
  value,
  label: `${config.flag} ${config.label}`,
}));

function formatSpend(n: number): string {
  if (n >= 1000) return '$' + (n / 1000).toFixed(1) + 'k';
  return '$' + Math.round(n);
}

export function CampaignModal({ open, onClose, messageId, productId, campaign, defaultGeo }: CampaignModalProps) {
  const [form] = Form.useForm<CampaignFormValues>();
  const [loading, setLoading] = useState(false);
  const [adCampaigns, setAdCampaigns] = useState<AdCampaignOption[]>([]);
  const [adCampaignsLoading, setAdCampaignsLoading] = useState(false);
  const { addCampaign, updateCampaign } = usePipelineStore();
  const isEdit = !!campaign;

  const selectedGeo = Form.useWatch('geo', form);

  // Fetch ad campaigns when geo changes
  const fetchAdCampaigns = useCallback(async (geo: string) => {
    if (!productId || !geo) {
      setAdCampaigns([]);
      return;
    }
    setAdCampaignsLoading(true);
    try {
      const params = new URLSearchParams({ productId, geo });
      const res = await fetch('/api/marketing-pipeline/campaigns/search?' + params.toString());
      const json = await res.json();
      if (json.success) {
        setAdCampaigns(json.data);
      }
    } catch {
      setAdCampaigns([]);
    } finally {
      setAdCampaignsLoading(false);
    }
  }, [productId]);

  // Re-fetch when geo selection changes
  useEffect(() => {
    if (open && selectedGeo) {
      fetchAdCampaigns(selectedGeo);
    }
  }, [open, selectedGeo, fetchAdCampaigns]);

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      if (campaign) {
        form.setFieldsValue({
          channel: campaign.channel,
          geo: campaign.geo,
          externalId: campaign.externalId || undefined,
          externalUrl: campaign.externalUrl || '',
        });
      } else {
        form.resetFields();
        if (defaultGeo) form.setFieldValue('geo', defaultGeo);
      }
    } else {
      setAdCampaigns([]);
    }
  }, [open, campaign, form, defaultGeo]);

  const handleSubmit = async (values: CampaignFormValues): Promise<void> => {
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

  const campaignSelectOptions = adCampaigns.map((c) => ({
    value: c.campaignId,
    label: c.campaignName,
    searchText: c.campaignName + ' ' + c.campaignId,
    spend: c.totalSpend,
  }));

  return (
    <Modal
      title={isEdit ? 'Edit Campaign' : 'Link Ad Campaign'}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText={isEdit ? 'Update' : 'Link Campaign'}
      confirmLoading={loading}
      destroyOnHidden
      className={modalStyles.modal}
      width={480}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
      >
        <Form.Item
          name="channel"
          label="Channel"
          rules={[{ required: true, message: 'Select a channel' }]}
        >
          <Select options={channelOptions} placeholder="Select channel" />
        </Form.Item>

        <Form.Item
          name="geo"
          label="Geography"
          rules={[{ required: true, message: 'Select a geography' }]}
        >
          <Select options={geoOptions} placeholder="Select geography" />
        </Form.Item>

        <Form.Item
          name="externalId"
          label="Ad Campaign"
          tooltip="Select an ad campaign to link live performance data (spend, CPA, conversions)."
          extra={!selectedGeo ? 'Select a geography first to see available campaigns.' : undefined}
        >
          <Select
            showSearch
            allowClear
            placeholder={adCampaignsLoading ? 'Loading campaigns...' : 'Search campaigns...'}
            disabled={!selectedGeo || adCampaignsLoading}
            loading={adCampaignsLoading}
            notFoundContent={adCampaignsLoading ? <Spin size="small" /> : 'No campaigns found for this product + geo'}
            filterOption={(input, option) => {
              if (!option) return false;
              const search = (option as { searchText?: string }).searchText ?? '';
              return search.toLowerCase().includes(input.toLowerCase());
            }}
            optionLabelProp="label"
            options={campaignSelectOptions.map((c) => ({
              value: c.value,
              label: c.label,
              searchText: c.searchText,
              title: c.value,
            }))}
            optionRender={(option) => {
              const match = adCampaigns.find((ac) => ac.campaignId === option.value);
              return (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {match?.campaignName ?? option.value}
                  </span>
                  {match && match.totalSpend > 0 && (
                    <span style={{ flexShrink: 0, fontSize: 12, color: 'var(--color-gray-500)' }}>
                      {formatSpend(match.totalSpend)}
                    </span>
                  )}
                </div>
              );
            }}
            virtual={false}
          />
        </Form.Item>

        <Form.Item name="externalUrl" label="External URL" extra="Link to the campaign in your ad platform.">
          <Input placeholder="https://..." />
        </Form.Item>
      </Form>
    </Modal>
  );
}
