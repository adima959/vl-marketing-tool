'use client';

import { useState } from 'react';
import { Search, Paperclip } from 'lucide-react';
import { CHANNEL_CONFIG, GEO_CONFIG } from '@/types';
import type { Channel, Geography } from '@/types';
import { usePipelineStore } from '@/stores/pipelineStore';
import { ExpandableFilterGroup } from '@/components/marketing-pipeline/ExpandableFilterGroup';
import styles from './PipelineBoard.module.css';

export function PipelineFilters() {
  const {
    users, products, angles,
    ownerFilter, productFilter, angleFilter, channelFilters, geoFilters,
    setOwnerFilter, setProductFilter, setAngleFilter, toggleChannelFilter, toggleGeoFilter,
    openProductPanel,
  } = usePipelineStore();

  // Row-level coordination: only one group expanded per row
  const [expandedRow1, setExpandedRow1] = useState<string | null>(null);
  const [expandedRow2, setExpandedRow2] = useState<string | null>(null);

  const handleOwnerToggle = (userId: string) => {
    setOwnerFilter(ownerFilter === userId ? 'all' : userId);
  };

  const handleProductToggle = (productId: string) => {
    setProductFilter(productFilter === productId ? 'all' : productId);
  };

  const handleAngleToggle = (angleId: string) => {
    setAngleFilter(angleFilter === angleId ? 'all' : angleId);
  };

  // Products filtered to selected owner
  const filteredProducts = ownerFilter !== 'all'
    ? products.filter(p => p.ownerId === ownerFilter)
    : products;

  // Angles filtered to selected product
  const filteredAngles = productFilter !== 'all'
    ? angles.filter(a => a.productId === productFilter)
    : angles;

  // Derive active labels for collapsed display
  const ownerActiveLabels = ownerFilter !== 'all'
    ? [users.find(u => u.id === ownerFilter)?.name ?? '']
    : [];

  const channelActiveLabels = channelFilters.map(
    k => CHANNEL_CONFIG[k as Channel]?.label ?? k
  );

  const geoActiveLabels = geoFilters.map(
    k => GEO_CONFIG[k as Geography]?.label ?? k
  );

  const productActiveLabels = productFilter !== 'all'
    ? [filteredProducts.find(p => p.id === productFilter)?.name ?? '']
    : [];

  const angleActiveLabels = angleFilter !== 'all'
    ? [filteredAngles.find(a => a.id === angleFilter)?.name ?? '']
    : [];

  return (
    <div className={styles.filtersWrapper}>
      <span className={styles.filtersLabel}>
        <Search size={14} />
        Filters:
      </span>
      <div className={styles.filterDivider} />
      <div className={styles.filtersRows}>
        {/* Row 1: Owner | Network | Country */}
        <div className={styles.filterBar}>
          <ExpandableFilterGroup
            label="Owner"
            options={users.map(u => ({ key: u.id, label: u.name, isActive: ownerFilter === u.id }))}
            activeLabels={ownerActiveLabels}
            mode="single"
            onToggle={handleOwnerToggle}
            isExpanded={expandedRow1 === 'owner'}
            onRequestExpand={() => setExpandedRow1('owner')}
            onRequestCollapse={() => setExpandedRow1(null)}
          />

          <div className={styles.filterDivider} />

          <ExpandableFilterGroup
            label="Network"
            options={Object.entries(CHANNEL_CONFIG).map(([key, config]) => ({
              key, label: config.label, isActive: channelFilters.includes(key),
            }))}
            activeLabels={channelActiveLabels}
            mode="multi"
            onToggle={toggleChannelFilter}
            isExpanded={expandedRow1 === 'network'}
            onRequestExpand={() => setExpandedRow1('network')}
            onRequestCollapse={() => setExpandedRow1(null)}
          />

          <div className={styles.filterDivider} />

          <ExpandableFilterGroup
            label="Country"
            options={Object.entries(GEO_CONFIG).map(([key, config]) => ({
              key, label: `${config.flag} ${config.label}`, isActive: geoFilters.includes(key),
            }))}
            activeLabels={geoActiveLabels}
            mode="multi"
            onToggle={toggleGeoFilter}
            isExpanded={expandedRow1 === 'country'}
            onRequestExpand={() => setExpandedRow1('country')}
            onRequestCollapse={() => setExpandedRow1(null)}
          />
        </div>

        {/* Row 2: Product + Angle */}
        {filteredProducts.length > 0 && (
          <div className={styles.filterBarSecondary}>
            <ExpandableFilterGroup
              label="Product"
              options={filteredProducts.map(p => ({ key: p.id, label: p.name, isActive: productFilter === p.id }))}
              activeLabels={productActiveLabels}
              mode="single"
              onToggle={handleProductToggle}
              isExpanded={expandedRow2 === 'product'}
              onRequestExpand={() => setExpandedRow2('product')}
              onRequestCollapse={() => setExpandedRow2(null)}
            />

            {/* Product Details link — shows next to collapsed label, hides when expanded */}
            {productFilter !== 'all' && expandedRow2 !== 'product' && (
              <button
                type="button"
                className={styles.productDetailsLink}
                onClick={() => openProductPanel(productFilter)}
              >
                <Paperclip size={12} />
                Product Details
              </button>
            )}

            {productFilter !== 'all' && filteredAngles.length > 0 && (
              <>
                <div className={styles.filterDivider} />
                <ExpandableFilterGroup
                  label="Angle"
                  options={filteredAngles.map(a => ({ key: a.id, label: a.name, isActive: angleFilter === a.id }))}
                  activeLabels={angleActiveLabels}
                  mode="single"
                  onToggle={handleAngleToggle}
                  isExpanded={expandedRow2 === 'angle'}
                  onRequestExpand={() => setExpandedRow2('angle')}
                  onRequestCollapse={() => setExpandedRow2(null)}
                />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
