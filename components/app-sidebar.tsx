"use client"

import * as React from "react"
import {
  LayoutDashboard,
  BarChart3,
  FileSearch,
  BarChart,
  LogOut,
  Settings,
  Kanban,
} from "lucide-react"
import { usePathname } from "next/navigation"

import { NavMainCollapsible, type NavItem } from "@/components/nav-main-collapsible"
import { NavFavorites } from "@/components/nav-favorites"
import { useAuth } from "@/contexts/AuthContext"
import { SETTINGS_PAGES } from "@/config/settings"
import type { FeatureKey } from "@/types/roles"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar"

type GatedNavItem = NavItem & { featureKey?: FeatureKey };

const ALL_MENU_ITEMS: GatedNavItem[] = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, featureKey: "analytics.dashboard" },
  { title: "Marketing Report", url: "/marketing-report", icon: BarChart3, featureKey: "analytics.marketing_report" },
  { title: "On Page Analysis", url: "/on-page-analysis", icon: FileSearch, featureKey: "analytics.on_page_analysis" },
];

const ALL_TOOL_ITEMS: GatedNavItem[] = [
  { title: "Pipeline", url: "/marketing-pipeline", icon: Kanban, featureKey: "tools.marketing_pipeline" },
];

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { logout, hasPermission } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);
  const pathname = usePathname();

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await logout();
  };

  const menuItems = React.useMemo(
    () => ALL_MENU_ITEMS.filter(i => !i.featureKey || hasPermission(i.featureKey, 'can_view')),
    [hasPermission]
  );

  const toolItems = React.useMemo(
    () => ALL_TOOL_ITEMS.filter(i => !i.featureKey || hasPermission(i.featureKey, 'can_view')),
    [hasPermission]
  );

  // Show Settings link if user can view any settings page
  const canSeeSettings = React.useMemo(
    () => SETTINGS_PAGES.some(p => hasPermission(p.featureKey, 'can_view')),
    [hasPermission]
  );

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <a href="/">
                <div className="flex aspect-square size-7 items-center justify-center rounded-lg bg-black text-white">
                  <BarChart className="size-3.5" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">Vitaliv</span>
                  <span className="truncate text-xs text-muted-foreground">Analytics</span>
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMainCollapsible label="Menu" items={menuItems} />
        <NavMainCollapsible label="Tools" items={toolItems} />
        <NavFavorites />
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          {canSeeSettings && (
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                tooltip="Settings"
                isActive={pathname.startsWith('/settings')}
              >
                <a href="/settings">
                  <Settings className="size-4" />
                  <span>Settings</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={handleLogout}
              disabled={isLoggingOut}
              tooltip="Logout"
            >
              <LogOut className="size-4" />
              <span>{isLoggingOut ? 'Logging out...' : 'Logout'}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
