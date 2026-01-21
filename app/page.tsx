import { PageHeader } from "@/components/layout/PageHeader"
import { LayoutDashboard } from "lucide-react"

export default function DashboardPage() {
  return (
    <>
      <PageHeader title="Dashboard" icon={<LayoutDashboard className="h-5 w-5" />} />
      <div className="p-10">
        <p className="text-muted-foreground">
          Welcome to Vitaliv Analytics. Select a report from the sidebar to get started.
        </p>
      </div>
    </>
  );
}
