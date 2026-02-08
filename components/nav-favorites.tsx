"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  LayoutDashboard,
  BarChart3,
  FileSearch,
  ClipboardCheck,
  Star,
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
  toggleFavorite,
  reorderFavorites,
} from "@/lib/api/savedViewsClient"
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
  onUnfavorite: (viewId: string) => void
}

function SortableFavorite({ view, onNavigate, onUnfavorite }: SortableFavoriteProps) {
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
    <SidebarMenuItem ref={setNodeRef} style={style} {...attributes} className="group/fav-item">
      <SidebarMenuButton
        size="sm"
        tooltip={view.name}
        className="pr-6 cursor-grab active:cursor-grabbing"
        onClick={() => onNavigate(view)}
        {...listeners}
      >
        <Icon className="shrink-0" />
        <span className="truncate text-xs" title={view.name}>{view.name}</span>
      </SidebarMenuButton>
      <button
        title="Remove from favorites"
        onClick={(e) => { e.stopPropagation(); onUnfavorite(view.id); }}
        className="absolute right-1 top-1/2 -translate-y-1/2 flex aspect-square w-5 items-center justify-center rounded-md p-0 outline-none hover:bg-sidebar-accent opacity-0 group-hover/fav-item:opacity-100 transition-opacity group-data-[collapsible=icon]:hidden"
        style={{ color: 'var(--color-primary-500)' }}
      >
        <Star className="size-3" fill="currentColor" />
      </button>
    </SidebarMenuItem>
  )
}

export function NavFavorites() {
  const router = useRouter()
  const [favorites, setFavorites] = useState<SavedView[]>([])
  const [mounted, setMounted] = useState(false)

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

  // Listen for changes from SavedViewsDropdown
  useEffect(() => {
    const handler = () => loadFavorites()
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

  const handleUnfavorite = async (viewId: string) => {
    // Optimistic removal
    setFavorites((prev) => prev.filter((f) => f.id !== viewId))
    try {
      await toggleFavorite(viewId, false)
      window.dispatchEvent(new Event("favorites-changed"))
    } catch (err) {
      console.warn("Failed to unfavorite:", err)
      loadFavorites() // Revert on failure
    }
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
                onUnfavorite={handleUnfavorite}
              />
            ))}
          </SidebarMenu>
        </SortableContext>
      </DndContext>
    </SidebarGroup>
  )
}
