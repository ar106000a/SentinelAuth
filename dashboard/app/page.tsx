"use client";

import { useDashboardAuth } from "@/lib/useDashboardAuth";

export default function DashboardHome() {
  const { me, checked } = useDashboardAuth();

  if (!checked) return null;
  if (!me) return null; // redirect already in flight

  return (
    <main
      style={{ maxWidth: 600, margin: "4rem auto", fontFamily: "system-ui" }}
    >
      <h1>{me.tenantName}</h1>
      <p>Risk threshold: {me.settings.riskThreshold}</p>
      <p>Fail open: {me.settings.failOpen ? "yes" : "no"}</p>
    </main>
  );
}
