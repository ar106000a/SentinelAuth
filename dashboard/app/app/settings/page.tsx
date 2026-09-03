import { requireDashboardSession } from "@/lib/dashboard-session";
import { SettingsForm } from "@/components/app/SettingsForm";

export default async function SettingsPage() {
  const { settings } = await requireDashboardSession();

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-display-xl">Settings</h1>
      <SettingsForm
        initialRiskThreshold={settings.riskThreshold}
        initialFailOpen={settings.failOpen}
      />
    </div>
  );
}
