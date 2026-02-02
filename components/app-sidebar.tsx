"use client"

import * as React from "react"
import {
  LayoutDashboard,
  BarChart3,
  FileSearch,
  BarChart,
  Target,
  Users,
  LogOut,
  CheckCircle2,
} from "lucide-react"

import { NavMain } from "@/components/nav-main"
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

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await logout();
  };

  // Base navigation items (available to all users)
  const baseNavItems = [
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
    {
      title: "Approval Rate",
      url: "/approval-rate",
      icon: CheckCircle2,
    },
    {
      title: "Marketing Tracker",
      url: "/marketing-tracker",
      icon: Target,
    },
  ];

  // Admin-only navigation items
  const adminNavItems = [
    {
      title: "User Management",
      url: "/users",
      icon: Users,
    },
  ];

  // Combine nav items based on user role from database
  // Role is checked in real-time on every auth validation
  const isAdmin = user?.role === UserRole.ADMIN;
  const navItems = isAdmin ? [...baseNavItems, ...adminNavItems] : baseNavItems;

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
        <NavMain items={navItems} />
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
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
