'use client';

import { Tag, Space } from 'antd';
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
import { useReportStore } from '@/stores/reportStore';
import { getDimensionLabel } from '@/config/dimensions';

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
    backgroundColor: '#4096ff',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    padding: '6px 12px',
    fontSize: 14,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    cursor: isDragging ? 'grabbing' : 'grab',
    opacity: isDragging ? 0.5 : 1,
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onRemove();
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <HolderOutlined style={{ fontSize: 12, color: '#fff' }} {...listeners} />
      <span {...listeners}>{getDimensionLabel(dimId)}</span>
      {canRemove && (
        <CloseOutlined
          style={{ fontSize: 11, color: '#fff', marginLeft: 4, cursor: 'pointer' }}
          onClick={handleRemove}
          onMouseDown={(e) => e.stopPropagation()}
        />
      )}
    </div>
  );
}

export function DimensionPills() {
  const { dimensions, removeDimension, reorderDimensions } = useReportStore();
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

  // Show simple version during SSR
  if (!mounted) {
    return (
      <Space size={10} wrap>
        {dimensions.map((dimId) => (
          <Tag
            key={dimId}
            color="blue"
            style={{ padding: '6px 12px', fontSize: 14 }}
          >
            {getDimensionLabel(dimId)}
          </Tag>
        ))}
      </Space>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={dimensions} strategy={horizontalListSortingStrategy}>
        <Space size={10} wrap>
          {dimensions.map((dimId) => (
            <SortableTag
              key={dimId}
              dimId={dimId}
              onRemove={() => removeDimension(dimId)}
              canRemove={dimensions.length > 1}
            />
          ))}
        </Space>
      </SortableContext>
    </DndContext>
  );
}
