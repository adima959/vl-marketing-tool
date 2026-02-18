'use client';

import { Search, Paperclip } from 'lucide-react';
import { CHANNEL_CONFIG, GEO_CONFIG } from '@/types';
import { usePipelineStore } from '@/stores/pipelineStore';
import styles from './PipelineBoard.module.css';

export function PipelineFilters() {
  const {
    users, products, angles,
    ownerFilter, productFilter, angleFilter, channelFilters, geoFilters,
    setOwnerFilter, setProductFilter, setAngleFilter, toggleChannelFilter, toggleGeoFilter,
    openProductPanel,
  } = usePipelineStore();

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

  return (
    <div className={styles.filtersWrapper}>
      <span className={styles.filtersLabel}>
        <Search size={14} />
        Filters:
      </span>
      <div className={styles.filterDivider} />
      <div className={styles.filtersRows}>
        {/* Row 1: Owner chips | Channel chips | GEO chips */}
        <div className={styles.filterBar}>
          <div className={styles.chipGroup}>
            <span className={styles.chipGroupLabel}>Owner</span>
            {(ownerFilter !== 'all'
              ? users.filter(u => u.id === ownerFilter)
              : users
            ).map(u => (
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

          <div className={styles.filterDivider} />

          <div className={styles.chipGroup}>
            <span className={styles.chipGroupLabel}>Network</span>
            {Object.entries(CHANNEL_CONFIG)
              .filter(([key]) => channelFilters.length === 0 || channelFilters.includes(key))
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

          <div className={styles.filterDivider} />
          <div className={styles.chipGroup}>
            <span className={styles.chipGroupLabel}>Country</span>
            {Object.entries(GEO_CONFIG)
              .filter(([key]) => geoFilters.length === 0 || geoFilters.includes(key))
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
        </div>

        {/* Row 2: Product chips + Angle chips */}
        {filteredProducts.length > 0 && (
          <div className={styles.filterBarSecondary}>
            <div className={styles.chipGroup}>
              <span className={styles.chipGroupLabel}>Product</span>
              {(productFilter !== 'all'
                ? filteredProducts.filter(p => p.id === productFilter)
                : filteredProducts
              ).map(p => (
                <button
                  key={p.id}
                  type="button"
                  className={`${styles.chip} ${productFilter === p.id ? styles.chipActive : ''}`}
                  onClick={() => handleProductToggle(p.id)}
                >
                  {p.name}
                </button>
              ))}
              {productFilter !== 'all' && (
                <button
                  type="button"
                  className={styles.productDetailsLink}
                  onClick={() => openProductPanel(productFilter)}
                >
                  <Paperclip size={12} />
                  Product Details
                </button>
              )}
            </div>

            {/* Angle chips (conditional on product) */}
            {productFilter !== 'all' && filteredAngles.length > 0 && (
              <>
                <div className={styles.filterDivider} />
                <div className={styles.chipGroup}>
                  <span className={styles.chipGroupLabel}>Angle</span>
                  {filteredAngles.map(a => (
                    <button
                      key={a.id}
                      type="button"
                      className={`${styles.chip} ${angleFilter === a.id ? styles.chipActive : ''}`}
                      onClick={() => setAngleFilter(angleFilter === a.id ? 'all' : a.id)}
                    >
                      {a.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
