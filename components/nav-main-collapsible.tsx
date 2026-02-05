"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ChevronDown, type LucideIcon } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"

import { cn } from "@/lib/utils"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"

export interface NavItem {
  title: string
  url: string
  icon?: LucideIcon
  items?: {
    title: string
    url: string
  }[]
}

function HoverDropdown({
  item,
  isCollapsed,
  pathname,
  router,
}: {
  item: NavItem
  isCollapsed: boolean
  pathname: string
  router: ReturnType<typeof useRouter>
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  const scheduleClose = useCallback(() => {
    cancelClose()
    closeTimerRef.current = setTimeout(() => {
      setOpen(false)
    }, 500)
  }, [cancelClose])

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    }
  }, [])

  const handleTriggerEnter = useCallback(() => {
    cancelClose()
    setOpen(true)
  }, [cancelClose])

  const handleClick = useCallback(() => {
    setOpen((prev) => !prev)
  }, [])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        triggerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      )
        return
      setOpen(false)
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [open])

  // Position menu to the right of the trigger, vertically centered
  const getMenuStyle = (): React.CSSProperties => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return { position: "fixed", top: 0, left: 0, zIndex: 50 }

    const menuHeight = (item.items?.length ?? 0) * 36 + 8
    const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 800

    // Always position to the right of the trigger
    const left = rect.right + 4

    // Align top of menu with top of trigger
    let top = rect.top
    if (top + menuHeight > viewportHeight - 8) {
      top = viewportHeight - menuHeight - 8
    }
    if (top < 8) top = 8

    return { position: "fixed", top, left, zIndex: 50 }
  }

  return (
    <>
      <SidebarMenuButton
        ref={triggerRef}
        tooltip={item.title}
        isActive={pathname.startsWith(item.url)}
        onClick={handleClick}
        onMouseEnter={handleTriggerEnter}
        onMouseLeave={scheduleClose}
      >
        {item.icon && <item.icon />}
        <span>{item.title}</span>
        <ChevronDown
          className={cn(
            "ml-auto h-4 w-4 shrink-0 opacity-50 transition-transform",
            open && "rotate-180"
          )}
        />
      </SidebarMenuButton>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            style={getMenuStyle()}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
          >
            {/* Arrow pointing left */}
            <div
              style={{
                position: "absolute",
                left: -6,
                top: 12,
                width: 12,
                height: 12,
                background: "#fff",
                borderLeft: "1px solid var(--color-border-medium, #d1d5db)",
                borderBottom: "1px solid var(--color-border-medium, #d1d5db)",
                transform: "rotate(45deg)",
                zIndex: 1,
              }}
            />
            {/* Menu panel */}
            <div
              style={{
                position: "relative",
                zIndex: 2,
                background: "#fff",
                border: "1px solid var(--color-border-medium, #d1d5db)",
                borderRadius: "var(--radius-lg, 8px)",
                boxShadow: "0 8px 24px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08)",
                padding: "4px",
                minWidth: 200,
              }}
            >
              {item.items?.map((subItem) => {
                const isActive = pathname === subItem.url
                return (
                  <button
                    key={subItem.title}
                    className={cn(
                      "relative flex w-full cursor-pointer select-none items-center rounded-md px-3 py-2 text-[13px] font-medium outline-none transition-all duration-150",
                      isActive
                        ? "text-[var(--color-primary-800,#007e47)]"
                        : "text-[var(--color-text-primary,#111827)] hover:bg-[var(--color-background-tertiary,#f5f6f7)]"
                    )}
                    style={isActive ? {
                      background: "var(--color-primary-50, #e6f9f4)",
                    } : undefined}
                    onClick={() => {
                      router.push(subItem.url)
                      setOpen(false)
                    }}
                  >
                    {isActive && (
                      <span
                        style={{
                          position: "absolute",
                          left: 0,
                          top: 6,
                          bottom: 6,
                          width: 3,
                          borderRadius: 2,
                          background: "var(--color-primary, #00B96B)",
                        }}
                      />
                    )}
                    <span>{subItem.title}</span>
                  </button>
                )
              })}
            </div>
          </div>,
          document.body
        )}
    </>
  )
}

export function NavMainCollapsible({
  label,
  items,
}: {
  label: string
  items: NavItem[]
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { state } = useSidebar()
  const isCollapsed = state === "collapsed"

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) =>
          item.items ? (
            <SidebarMenuItem key={item.title}>
              <HoverDropdown
                item={item}
                isCollapsed={isCollapsed}
                pathname={pathname}
                router={router}
              />
            </SidebarMenuItem>
          ) : (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                asChild
                tooltip={item.title}
                isActive={pathname === item.url || pathname.startsWith(item.url + '/')}
              >
                <a href={item.url}>
                  {item.icon && <item.icon />}
                  <span>{item.title}</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )
        )}
      </SidebarMenu>
    </SidebarGroup>
  )
}
