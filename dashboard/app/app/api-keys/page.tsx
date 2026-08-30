import { Card } from "@/components/ui/Card";

export default function ApiKeysPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-display-xl">API keys</h1>
      <Card className="p-8">
        <p className="text-body text-[var(--color-text-secondary)]">
          Rotation via <code className="text-data text-[var(--color-text-primary)]">POST /dashboard/keys/rotate</code> —
          this revokes every active user session, so the confirmation step here matters more than most.
        </p>
      </Card>
    </div>
  );
}