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
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-[var(--radius-sm)] focus:bg-[var(--color-text-primary)] focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-[var(--color-base)]"
      >
        Skip to main content
      </a>
      <div className="flex min-h-screen bg-[var(--color-base)]">
        <Sidebar />
        <div className="flex flex-1 flex-col">
          <Topbar tenantName={session.tenantName} />
          <main id="main-content" className="flex-1 px-8 py-8">
            {children}
          </main>
        </div>
      </div>
    </NavigationProvider>
  );
}
