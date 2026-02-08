"use client"

import * as React from "react"
import {
  LayoutDashboard,
  BarChart3,
  FileSearch,
  BarChart,
  Target,
  LogOut,
  ClipboardCheck,
  Settings,
  Kanban,
} from "lucide-react"
import { usePathname } from "next/navigation"

import { NavMain } from "@/components/nav-main"
import { NavMainCollapsible, type NavItem } from "@/components/nav-main-collapsible"
import { useAuth } from "@/contexts/AuthContext"
import { UserRole } from "@/types/user"
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

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user, logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);
  const pathname = usePathname();

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await logout();
  };

  // Menu items (main navigation)
  const menuItems = [
    {
      title: "Dashboard",
      url: "/",
      icon: LayoutDashboard,
    },
    {
      title: "Marketing Report",
      url: "/marketing-report",
      icon: BarChart3,
    },
    {
      title: "On Page Analysis",
      url: "/on-page-analysis",
      icon: FileSearch,
    },
  ];

  // Validation Reports section (collapsible with sub-items)
  const validationReportsItems: NavItem[] = [
    {
      title: "Validation Reports",
      url: "/validation-reports",
      icon: ClipboardCheck,
      items: [
        {
          title: "Approval Rate",
          url: "/validation-reports/approval-rate",
        },
        {
          title: "Buy Rate",
          url: "/validation-reports/buy-rate",
        },
        {
          title: "Pay Rate",
          url: "/validation-reports/pay-rate",
        },
      ],
    },
  ];

  // Tools items (separate section)
  const toolItems = [
    {
      title: "Marketing Tracker",
      url: "/marketing-tracker",
      icon: Target,
    },
    {
      title: "Pipeline",
      url: "/marketing-pipeline",
      icon: Kanban,
    },
  ];

  // Check if user is admin
  const isAdmin = user?.role === UserRole.ADMIN;

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <a href="/">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-black text-white">
                  <BarChart className="size-4" />
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
        <NavMain label="Menu" items={menuItems} />
        <NavMainCollapsible label="Reports" items={validationReportsItems} />
        <NavMain label="Tools" items={toolItems} />
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          {isAdmin && (
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
