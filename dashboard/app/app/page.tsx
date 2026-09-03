import { Building2, ShieldCheck, ShieldAlert } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { RiskBadge } from "@/components/ui/Badge";
import { ChartEmptyState } from "@/components/charts/ChartStates";
import { MetricCard } from "@/components/app/MetricCard";
import { requireDashboardSession } from "@/lib/dashboard-session";

export default async function OverviewPage() {
  const session = await requireDashboardSession();
  const { tenantName, settings } = session;

  return (
    <div className="space-y-6">
      <h1 className="text-display-xl">Overview</h1>

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard icon={<Building2 />} label="Tenant" value={tenantName} />
        <MetricCard
          icon={<ShieldCheck />}
          label="Risk threshold"
          value={<RiskBadge score={settings.riskThreshold} />}
          hint="Logins scoring above this are challenged with MFA."
        />
        <MetricCard
          icon={settings.failOpen ? <ShieldAlert /> : <ShieldCheck />}
          label="On engine failure"
          value={settings.failOpen ? "Fail open" : "Fail closed"}
          hint={
            settings.failOpen
              ? "Logins are allowed through if the risk engine is unreachable."
              : "Logins are blocked if the risk engine is unreachable."
          }
        />
      </div>

      <Card signal>
        <CardHeader>
          <CardTitle>Login activity</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <ChartEmptyState
            title="No activity yet"
            description="Connect more logins to see risk trends over time."
          />
        </CardContent>
      </Card>
    </div>
  );
}
