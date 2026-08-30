import { Card } from "@/components/ui/Card";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-display-xl">Settings</h1>
      <Card className="p-8">
        <p className="text-body text-[var(--color-text-secondary)]">
          <code className="text-data text-[var(--color-text-primary)]">
            riskThreshold
          </code>{" "}
          and{" "}
          <code className="text-data text-[var(--color-text-primary)]">
            failOpen
          </code>{" "}
          from{" "}
          <code className="text-data text-[var(--color-text-primary)]">
            GET/PUT /dashboard/settings
          </code>
          .
        </p>
      </Card>
    </div>
  );
}
