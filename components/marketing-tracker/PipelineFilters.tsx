'use client';

import { Select } from 'antd';
import { CHANNEL_CONFIG, GEO_CONFIG } from '@/types';
import { usePipelineStore } from '@/stores/pipelineStore';
import styles from './PipelineBoard.module.css';

export function PipelineFilters() {
  const {
    users, products, angles, stages,
    ownerFilter, productFilter, angleFilter, channelFilters, geoFilters,
    setOwnerFilter, setProductFilter, setAngleFilter, toggleChannelFilter, toggleGeoFilter,
  } = usePipelineStore();

  // Derive active channels and geos from pipeline card campaigns
  const allCards = Object.values(stages).flat();
  const activeChannels = new Set<string>();
  const activeGeos = new Set<string>();
  for (const card of allCards) {
    for (const campaign of card.campaigns) {
      activeChannels.add(campaign.channel);
      activeGeos.add(campaign.geo);
    }
  }

  const handleOwnerToggle = (userId: string) => {
    setOwnerFilter(ownerFilter === userId ? 'all' : userId);
  };

  const handleProductToggle = (productId: string) => {
    setProductFilter(productFilter === productId ? 'all' : productId);
  };

  // Products filtered to selected owner
  const filteredProducts = ownerFilter !== 'all'
    ? products.filter(p => p.ownerId === ownerFilter)
    : products;

  // Angles filtered to selected product
  const filteredAngles = productFilter !== 'all'
    ? angles.filter(a => a.productId === productFilter)
    : angles;

  const angleOptions = [
    { value: 'all', label: 'All Angles' },
    ...filteredAngles.map(a => ({ value: a.id, label: a.name })),
  ];

  return (
    <div className={styles.filtersWrapper}>
      {/* Row 1: Owner chips | Channel chips | GEO chips | New Message */}
      <div className={styles.filterBar}>
        <div className={styles.chipGroup}>
          <span className={styles.chipGroupLabel}>Owner</span>
          {users.map(u => (
            <button
              key={u.id}
              type="button"
              className={`${styles.chip} ${styles.chipOwner} ${ownerFilter === u.id ? styles.chipActive : ''}`}
              onClick={() => handleOwnerToggle(u.id)}
            >
              {u.name}
            </button>
          ))}
        </div>

        {(activeChannels.size > 0 || activeGeos.size > 0) && <div className={styles.filterDivider} />}

        {activeChannels.size > 0 && (
          <div className={styles.chipGroup}>
            {Object.entries(CHANNEL_CONFIG)
              .filter(([key]) => activeChannels.has(key))
              .map(([key, config]) => (
                <button
                  key={key}
                  type="button"
                  className={`${styles.chip} ${styles.chipChannel} ${channelFilters.includes(key) ? styles.chipActive : ''}`}
                  onClick={() => toggleChannelFilter(key)}
                >
                  {config.label}
                </button>
              ))}
          </div>
        )}

        {activeGeos.size > 0 && (
          <>
            {activeChannels.size > 0 && <div className={styles.filterDivider} />}
            <div className={styles.chipGroup}>
              {Object.entries(GEO_CONFIG)
                .filter(([key]) => activeGeos.has(key))
                .map(([key, config]) => (
                  <button
                    key={key}
                    type="button"
                    className={`${styles.chip} ${styles.chipGeo} ${geoFilters.includes(key) ? styles.chipActive : ''}`}
                    onClick={() => toggleGeoFilter(key)}
                  >
                    {config.flag} {config.label}
                  </button>
                ))}
            </div>
          </>
        )}

      </div>

      {/* Row 2: Product chips (conditional on owner) */}
      {ownerFilter !== 'all' && filteredProducts.length > 0 && (
        <div className={styles.filterBarSecondary}>
          <div className={styles.chipGroup}>
            <span className={styles.chipGroupLabel}>Product</span>
            {filteredProducts.map(p => (
              <button
                key={p.id}
                type="button"
                className={`${styles.chip} ${productFilter === p.id ? styles.chipActive : ''}`}
                onClick={() => handleProductToggle(p.id)}
              >
                {p.name}
              </button>
            ))}
          </div>

          {/* Angle dropdown (conditional on product) */}
          {productFilter !== 'all' && filteredAngles.length > 0 && (
            <>
              <div className={styles.filterDivider} />
              <Select
                value={angleFilter}
                onChange={setAngleFilter}
                options={angleOptions}
                size="small"
                className={`${styles.filterSelect} ${angleFilter !== 'all' ? styles.filterSelectActive : ''}`}
                popupMatchSelectWidth={false}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
