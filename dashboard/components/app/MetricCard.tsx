import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";

export interface MetricCardProps {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  hint?: string;
}

export function MetricCard({ icon, label, value, hint }: MetricCardProps) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-[var(--color-text-secondary)]">
        <span className="[&>svg]:h-4 [&>svg]:w-4" aria-hidden="true">
          {icon}
        </span>
        <span className="text-caption">{label}</span>
      </div>
      <div className="text-display-md mt-2 text-[var(--color-text-primary)]">
        {value}
      </div>
      {hint && <p className="text-caption mt-1">{hint}</p>}
    </Card>
  );
}
