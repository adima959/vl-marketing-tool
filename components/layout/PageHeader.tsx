"use client"

import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"

interface PageHeaderProps {
  title: string
  icon?: React.ReactNode
  actions?: React.ReactNode
  warning?: React.ReactNode
}

export function PageHeader({ title, icon, actions, warning }: PageHeaderProps) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-white px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="h-6" />
      <div className="flex items-center gap-3">
        {icon && <div className="flex h-8 w-8 items-center justify-center">{icon}</div>}
        <h1 className="text-xl font-semibold">{title}</h1>
      </div>
      {warning && (
        <div className="flex-1 flex items-center justify-center">
          {warning}
        </div>
      )}
      {actions && (
        <div className={`flex items-center gap-2 ${!warning ? 'ml-auto' : ''}`}>
          {actions}
        </div>
      )}
    </header>
  )
}
