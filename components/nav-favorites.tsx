"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  LayoutDashboard,
  BarChart3,
  FileSearch,
  ClipboardCheck,
  Target,
  Pencil,
  GripVertical,
  type LucideIcon,
} from "lucide-react"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  fetchFavoriteViews,
  reorderFavorites,
} from "@/lib/api/savedViewsClient"
import { EditViewModal } from "@/components/saved-views/EditViewModal"
import type { SavedView } from "@/types/savedViews"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar"

const PAGE_ICONS: Record<string, LucideIcon> = {
  "/": LayoutDashboard,
  "/marketing-report": BarChart3,
  "/marketing-pipeline": Target,
  "/on-page-analysis": FileSearch,
  "/validation-reports/approval-rate": ClipboardCheck,
  "/validation-reports/buy-rate": ClipboardCheck,
  "/validation-reports/pay-rate": ClipboardCheck,
}

function getPageIcon(pagePath: string): LucideIcon {
  return PAGE_ICONS[pagePath] || LayoutDashboard
}

interface SortableFavoriteProps {
  view: SavedView
  onNavigate: (view: SavedView) => void
  onEdit: (view: SavedView) => void
}

function SortableFavorite({ view, onNavigate, onEdit }: SortableFavoriteProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: view.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const Icon = getPageIcon(view.pagePath)

  return (
    <SidebarMenuItem ref={setNodeRef} style={style} className="group/fav-item">
      <SidebarMenuButton
        size="sm"
        tooltip={view.name}
        className="relative pr-5"
        onClick={() => onNavigate(view)}
      >
        <span
          {...attributes}
          {...listeners}
          className="absolute left-0.5 top-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing opacity-0 group-hover/fav-item:opacity-100 transition-opacity text-sidebar-foreground/50 hover:text-sidebar-foreground"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation() }}
        >
          <GripVertical className="size-3" />
        </span>
        <Icon className="shrink-0" />
        <span className="truncate text-[11px]" title={view.name}>{view.name}</span>
      </SidebarMenuButton>
      <button
        title="Edit view"
        onClick={(e) => { e.stopPropagation(); onEdit(view); }}
        className="absolute right-0.5 top-1/2 -translate-y-1/2 flex aspect-square w-5 items-center justify-center rounded-md p-0 outline-none hover:bg-sidebar-accent opacity-0 group-hover/fav-item:opacity-100 transition-opacity group-data-[collapsible=icon]:hidden"
        style={{ color: 'var(--color-gray-400)' }}
      >
        <Pencil className="size-3" />
      </button>
    </SidebarMenuItem>
  )
}

export function NavFavorites() {
  const router = useRouter()
  const [favorites, setFavorites] = useState<SavedView[]>([])
  const [mounted, setMounted] = useState(false)
  const [editView, setEditView] = useState<SavedView | null>(null)

  const loadFavorites = useCallback(async () => {
    try {
      const data = await fetchFavoriteViews()
      setFavorites(data)
    } catch (err) {
      console.warn("Failed to load favorites:", err)
    }
  }, [])

  useEffect(() => {
    setMounted(true)
    loadFavorites()
  }, [loadFavorites])

  // Listen for changes — handle optimistic CustomEvents or fallback to re-fetch
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.action === 'add' && detail.view) {
        setFavorites(prev => {
          if (prev.some(f => f.id === detail.view.id)) return prev
          return [...prev, { ...detail.view, isFavorite: true }]
        })
      } else if (detail?.action === 'remove' && detail.viewId) {
        setFavorites(prev => prev.filter(f => f.id !== detail.viewId))
      } else if (detail?.action === 'update' && detail.view) {
        setFavorites(prev => prev.map(f => f.id === detail.view.id ? { ...f, ...detail.view } : f))
      } else {
        loadFavorites()
      }
    }
    window.addEventListener("favorites-changed", handler)
    return () => window.removeEventListener("favorites-changed", handler)
  }, [loadFavorites])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = favorites.findIndex((f) => f.id === active.id)
    const newIndex = favorites.findIndex((f) => f.id === over.id)
    const reordered = arrayMove(favorites, oldIndex, newIndex)

    // Optimistic update
    setFavorites(reordered)

    // Persist new order
    const items = reordered.map((f, i) => ({ id: f.id, favoriteOrder: i }))
    reorderFavorites(items).catch((err) => {
      console.warn("Failed to reorder favorites:", err)
      loadFavorites() // Revert on failure
    })
  }

  const handleNavigate = (view: SavedView) => {
    router.push(`${view.pagePath}?viewId=${view.id}`)
  }

  const handleRenamed = (updated: SavedView) => {
    if (!updated.isFavorite) {
      // Unfavorited through edit modal — remove from list
      setFavorites(prev => prev.filter(f => f.id !== updated.id))
    } else {
      setFavorites(prev => prev.map(f => f.id === updated.id ? { ...f, name: updated.name } : f))
    }
  }

  const handleDeleted = (viewId: string) => {
    setFavorites(prev => prev.filter(f => f.id !== viewId))
    window.dispatchEvent(new CustomEvent('favorites-changed', {
      detail: { action: 'remove', viewId },
    }))
  }

  if (!mounted || favorites.length === 0) return null

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Favorites</SidebarGroupLabel>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={favorites.map((f) => f.id)}
          strategy={verticalListSortingStrategy}
        >
          <SidebarMenu>
            {favorites.map((view) => (
              <SortableFavorite
                key={view.id}
                view={view}
                onNavigate={handleNavigate}
                onEdit={setEditView}
              />
            ))}
          </SidebarMenu>
        </SortableContext>
      </DndContext>

      <EditViewModal
        open={editView !== null}
        onClose={() => setEditView(null)}
        view={editView}
        onRenamed={handleRenamed}
        onDeleted={handleDeleted}
      />
    </SidebarGroup>
  )
}
