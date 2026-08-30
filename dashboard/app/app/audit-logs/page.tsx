import { Card } from "@/components/ui/Card";

export default function AuditLogsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-display-xl">Audit logs</h1>
      <Card className="p-8">
        <p className="text-body text-[var(--color-text-secondary)]">
          Filterable, paginated risk log from{" "}
          <code className="text-data text-[var(--color-text-primary)]">GET /dashboard/audit-logs</code> —
          this is where <code className="text-data text-[var(--color-text-primary)]">RiskBadge</code> earns
          its keep, one row per login attempt.
        </p>
      </Card>
    </div>
  );
}