import { NavigationProvider } from "@/lib/navigation";
import { Sidebar } from "@/components/shell/Sidebar";
import { Topbar } from "@/components/shell/Topbar";
import { requireDashboardSession } from "@/lib/dashboard-session";

export default async function DashboardShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireDashboardSession();

  return (
    <NavigationProvider>
      <div className="flex min-h-screen bg-[var(--color-base)]">
        <Sidebar />
        <div className="flex flex-1 flex-col">
          <Topbar tenantName={session.tenantName} />
          <main className="flex-1 px-8 py-8">{children}</main>
        </div>
      </div>
    </NavigationProvider>
  );
}
