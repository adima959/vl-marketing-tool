'use client';

import { Space } from 'antd';
import { CloseOutlined, HolderOutlined } from '@ant-design/icons';
import { useState, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDashboardStore } from '@/stores/dashboardStore';
import { getDashboardDimensionLabel } from '@/config/dashboardDimensions';
import styles from '../filters/DimensionPills.module.css';

interface SortableTagProps {
  dimId: string;
  onRemove: () => void;
  canRemove: boolean;
}

function SortableTag({ dimId, onRemove, canRemove }: SortableTagProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: dimId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onRemove();
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${styles.sortableTag} ${isDragging ? styles.sortableTagDragging : ''}`}
      {...attributes}
    >
      <HolderOutlined className={styles.dragHandle} {...listeners} />
      <span {...listeners}>{getDashboardDimensionLabel(dimId)}</span>
      {canRemove && (
        <CloseOutlined
          className={styles.closeIcon}
          onClick={handleRemove}
          onMouseDown={(e) => e.stopPropagation()}
        />
      )}
    </div>
  );
}

export function DashboardDimensionPills() {
  const { dimensions, reorderDimensions } = useDashboardStore();
  const [mounted, setMounted] = useState(false);

  // Only render DnD after client-side mount to avoid hydration issues
  useEffect(() => {
    setMounted(true);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = dimensions.indexOf(active.id as string);
      const newIndex = dimensions.indexOf(over.id as string);
      const newOrder = arrayMove(dimensions, oldIndex, newIndex);
      reorderDimensions(newOrder);
    }
  };

  // Show nothing during SSR - will hydrate immediately on client
  if (!mounted) {
    return null;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={dimensions} strategy={horizontalListSortingStrategy}>
        <Space size={6} wrap>
          {dimensions.map((dimId) => (
            <SortableTag
              key={dimId}
              dimId={dimId}
              onRemove={() => {}}
              canRemove={false}
            />
          ))}
        </Space>
      </SortableContext>
    </DndContext>
  );
}
