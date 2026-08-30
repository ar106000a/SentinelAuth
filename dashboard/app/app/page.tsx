import { Card } from "@/components/ui/Card";

export default function OverviewPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-display-xl">Overview</h1>
      <Card className="p-8">
        <p className="text-body text-[var(--color-text-secondary)]">
          Recent risk activity and account summary land here once{" "}
          <code className="text-data text-[var(--color-text-primary)]">GET /dashboard/me</code> and{" "}
          <code className="text-data text-[var(--color-text-primary)]">GET /dashboard/audit-logs</code> are
          wired up.
        </p>
      </Card>
    </div>
  );
}