"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  RiskTrendChart,
  type RiskTrendPoint,
} from "@/components/charts/RiskTrendChart";
import {
  ChartSkeleton,
  ChartEmptyState,
  ChartErrorState,
} from "@/components/charts/ChartStates";

const SAMPLE_TREND: RiskTrendPoint[] = [
  { timestamp: "00:00", score: 0.08 },
  { timestamp: "02:00", score: 0.05 },
  { timestamp: "04:00", score: 0.12 },
  { timestamp: "06:00", score: 0.09 },
  { timestamp: "08:00", score: 0.15 },
  { timestamp: "10:00", score: 0.22 },
  { timestamp: "12:00", score: 0.18 },
  { timestamp: "14:00", score: 0.31 },
  { timestamp: "16:00", score: 0.85 },
  { timestamp: "18:00", score: 0.92 },
  { timestamp: "20:00", score: 0.4 },
  { timestamp: "22:00", score: 0.14 },
];

type ChartDemoState = "data" | "loading" | "empty" | "error";

export function ChartDemo() {
  const [state, setState] = useState<ChartDemoState>("data");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(["data", "loading", "empty", "error"] as const).map((s) => (
          <Button
            key={s}
            variant={state === s ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setState(s)}
          >
            {s}
          </Button>
        ))}
      </div>
      <Card className="p-5">
        {state === "data" && <RiskTrendChart data={SAMPLE_TREND} />}
        {state === "loading" && <ChartSkeleton />}
        {state === "empty" && <ChartEmptyState />}
        {state === "error" && (
          <ChartErrorState onRetry={() => setState("data")} />
        )}
      </Card>
    </div>
  );
}
