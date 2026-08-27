import { Card } from "@/components/ui/Card";

export default function UsersPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-display-xl">Users</h1>
      <Card className="p-8">
        <p className="text-body text-[var(--color-text-secondary)]">
          Paginated tenant user list from{" "}
          <code className="text-data text-[var(--color-text-primary)]">GET /dashboard/users</code>, with
          GDPR deletion via{" "}
          <code className="text-data text-[var(--color-text-primary)]">DELETE /dashboard/users/:id</code>.
        </p>
      </Card>
    </div>
  );
}