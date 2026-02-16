'use client';

import { useState, useCallback } from 'react';
import { Table, Button, Popconfirm, Dropdown, type MenuProps } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, DownOutlined, RightOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { MessageDetail, Campaign, Geography, Product, GeoStage } from '@/types';
import { GEO_CONFIG, CAMPAIGN_STATUS_CONFIG } from '@/types';
import { getCpaTarget, getCpaHealth } from '@/lib/marketing-pipeline/cpaUtils';
import { GeoStageBadge } from './GeoStageBadge';
import stickyStyles from '@/styles/tables/sticky.module.css';
import styles from './ConceptDetailPanel.module.css';

interface GeoTracksSectionProps {
  message: MessageDetail;
  onAddGeo: (messageId: string, data: { geo: Geography }) => void;
  onUpdateGeoStage: (geoId: string, data: { stage: GeoStage }) => void;
  onRemoveGeo: (geoId: string) => void;
  onDeleteCampaign: (id: string) => void;
  onOpenCampaignModal: (geo: Geography | undefined, campaign: Campaign | null) => void;
}

export function GeoTracksSection({
  message,
  onAddGeo,
  onUpdateGeoStage,
  onRemoveGeo,
  onDeleteCampaign,
  onOpenCampaignModal,
}: GeoTracksSectionProps): React.ReactNode {
  const [collapsedGeos, setCollapsedGeos] = useState<Set<string>>(new Set());

  const toggleGeo = useCallback((geoId: string) => {
    setCollapsedGeos(prev => {
      const next = new Set(prev);
      if (next.has(geoId)) next.delete(geoId);
      else next.add(geoId);
      return next;
    });
  }, []);

  const product = message.product;
  const geos = message.geos || [];
  const hasGeos = geos.length > 0;

  const existingGeoSet = new Set(geos.map(g => g.geo));
  const availableGeos = (Object.keys(GEO_CONFIG) as Geography[]).filter(g => !existingGeoSet.has(g));
  const addGeoMenuItems: MenuProps['items'] = availableGeos.map(geo => ({
    key: geo,
    label: `${GEO_CONFIG[geo].flag} ${GEO_CONFIG[geo].label}`,
  }));

  const campaignColumns = buildCampaignColumns(product, onOpenCampaignModal, onDeleteCampaign);

  const unassignedCampaigns = message.campaigns.filter(c => !existingGeoSet.has(c.geo));

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>Geo Tracks</span>
        <Dropdown
          menu={{
            items: addGeoMenuItems,
            onClick: ({ key }) => onAddGeo(message.id, { geo: key as Geography }),
          }}
          trigger={['click']}
          disabled={availableGeos.length === 0}
        >
          <Button size="small" type="primary" icon={<PlusOutlined />} disabled={availableGeos.length === 0}>
            Add Geo
          </Button>
        </Dropdown>
      </div>

      {!hasGeos && (
        <div className={styles.geoEmpty}>
          No geos added yet. Add a geography to start tracking.
        </div>
      )}

      {geos.map(geo => {
        const isExpanded = !collapsedGeos.has(geo.id);
        const geoCampaigns = message.campaigns.filter(c => c.geo === geo.geo);
        const geoConfig = GEO_CONFIG[geo.geo];
        const geoSpend = geoCampaigns.reduce((sum, c) => sum + c.spend, 0);

        return (
          <div key={geo.id} className={styles.geoTrack}>
            <div className={styles.geoTrackHeader} onClick={() => toggleGeo(geo.id)}>
              <span className={styles.geoExpandIcon}>
                {isExpanded ? <DownOutlined /> : <RightOutlined />}
              </span>
              <span className={styles.geoTrackFlag}>{geoConfig.flag}</span>
              <span className={styles.geoTrackName}>{geoConfig.label}</span>
              <span onClick={e => e.stopPropagation()}>
                <GeoStageBadge
                  stage={geo.stage}
                  editable
                  onChange={(stage) => onUpdateGeoStage(geo.id, { stage })}
                  size="small"
                />
              </span>
              {geo.isPrimary && <span className={styles.primaryBadge}>Primary</span>}
              <span className={styles.geoTrackMeta}>
                {geoCampaigns.length} campaign{geoCampaigns.length !== 1 ? 's' : ''}
                {geoSpend > 0 ? ` · $${geoSpend}` : ''}
              </span>
              <Popconfirm
                title={`Remove ${geoConfig.label}?`}
                onConfirm={() => onRemoveGeo(geo.id)}
                okText="Remove"
                okButtonProps={{ danger: true }}
              >
                <DeleteOutlined
                  className={styles.geoTrackDelete}
                  onClick={e => e.stopPropagation()}
                />
              </Popconfirm>
            </div>

            {isExpanded && (
              <div className={styles.geoTrackContent}>
                {geoCampaigns.length > 0 && (
                  <div className={stickyStyles.stickyTable}>
                    <Table
                      columns={campaignColumns}
                      dataSource={geoCampaigns.map(c => ({ ...c, key: c.id }))}
                      pagination={false}
                      size="small"
                      className={styles.campaignsTable}
                      sticky={{ offsetHeader: 0 }}
                    />
                  </div>
                )}

                <div className={styles.geoAddButtons}>
                  <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => onOpenCampaignModal(geo.geo, null)}>
                    Campaign
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {hasGeos && unassignedCampaigns.length > 0 && (
        <div className={styles.geoTrack} style={{ marginTop: 8 }}>
          <div className={styles.geoTrackHeader} style={{ cursor: 'default' }}>
            <span className={styles.geoTrackName} style={{ color: 'var(--color-gray-500)' }}>Untracked</span>
            <span className={styles.geoTrackMeta}>
              {unassignedCampaigns.length} item{unassignedCampaigns.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className={styles.geoTrackContent}>
            <div className={stickyStyles.stickyTable}>
              <Table
                columns={campaignColumns}
                dataSource={unassignedCampaigns.map(c => ({ ...c, key: c.id }))}
                pagination={false}
                size="small"
                className={styles.campaignsTable}
                sticky={{ offsetHeader: 0 }}
              />
            </div>
          </div>
        </div>
      )}

      {!hasGeos && message.campaigns.length > 0 && (
        <>
          <div className={styles.geoSubLabel} style={{ marginTop: 12 }}>Campaigns</div>
          <div className={stickyStyles.stickyTable}>
            <Table
              columns={campaignColumns}
              dataSource={message.campaigns.map(c => ({ ...c, key: c.id }))}
              pagination={false}
              size="small"
              className={styles.campaignsTable}
              sticky={{ offsetHeader: 0 }}
            />
          </div>
        </>
      )}
    </div>
  );
}

function renderCpaBadge(cpa: number, target: number | undefined): React.ReactNode {
  const health = getCpaHealth(cpa, target);
  const colorClass = health === 'green' ? styles.cpaGreen
    : health === 'yellow' ? styles.cpaYellow
    : health === 'red' ? styles.cpaRed
    : '';
  return (
    <span className={`${styles.cpaBadge} ${colorClass}`}>
      ${cpa}
      {health !== 'none' && <span className={`${styles.cpaDot} ${styles[health]}`} />}
    </span>
  );
}

function buildCampaignColumns(
  product: Product | undefined,
  onOpenCampaignModal: (geo: Geography | undefined, campaign: Campaign | null) => void,
  onDeleteCampaign: (id: string) => void,
): ColumnsType<Campaign> {
  return [
    {
      title: 'Channel',
      dataIndex: 'channel',
      key: 'channel',
      width: 80,
      render: (channel: string) => channel.charAt(0).toUpperCase() + channel.slice(1),
    },
    {
      title: 'GEO',
      dataIndex: 'geo',
      key: 'geo',
      width: 50,
      render: (geo: Geography) => GEO_CONFIG[geo]?.flag || geo,
    },
    {
      title: 'CPA',
      dataIndex: 'cpa',
      key: 'cpa',
      width: 80,
      render: (cpa: number | undefined, record: Campaign) => {
        if (cpa == null) return '—';
        const target = product ? getCpaTarget(product, record.geo) : undefined;
        return renderCpaBadge(cpa, target);
      },
    },
    {
      title: 'Target',
      key: 'target',
      width: 60,
      render: (_: unknown, record: Campaign) => {
        const target = product ? getCpaTarget(product, record.geo) : undefined;
        return target != null ? `$${target}` : '—';
      },
    },
    {
      title: 'Spend',
      dataIndex: 'spend',
      key: 'spend',
      width: 70,
      render: (spend: number) => `$${spend}`,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 70,
      render: (status: string) => {
        const config = CAMPAIGN_STATUS_CONFIG[status as keyof typeof CAMPAIGN_STATUS_CONFIG];
        return config ? (
          <span style={{ color: config.color, fontSize: '11px', fontWeight: 500 }}>
            {config.label}
          </span>
        ) : status;
      },
    },
    {
      title: '',
      key: 'actions',
      width: 50,
      render: (_: unknown, record: Campaign) => (
        <span style={{ display: 'flex', gap: 8 }}>
          <EditOutlined
            style={{ fontSize: 12, color: 'var(--color-gray-400)', cursor: 'pointer' }}
            onClick={(e) => {
              e.stopPropagation();
              onOpenCampaignModal(record.geo, record);
            }}
          />
          <Popconfirm title="Delete this campaign?" onConfirm={() => onDeleteCampaign(record.id)} okText="Delete" okButtonProps={{ danger: true }}>
            <DeleteOutlined style={{ fontSize: 12, color: 'var(--color-gray-400)', cursor: 'pointer' }} />
          </Popconfirm>
        </span>
      ),
    },
  ];
}
