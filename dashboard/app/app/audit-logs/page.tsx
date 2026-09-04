import { AuditLogTable } from "@/components/app/AuditLogTable";

export default function AuditLogsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-display-xl">Audit logs</h1>
      <AuditLogTable />
    </div>
  );
}
