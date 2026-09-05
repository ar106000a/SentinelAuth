"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  ChartSkeleton,
  ChartErrorState,
  ChartEmptyState,
} from "@/components/charts/ChartStates";
import { LoginVolumeChart } from "@/components/charts/LoginVolumeChart";
import { RiskDistributionChart } from "@/components/charts/RiskDistributionChart";
import { riskColor } from "@/lib/risk";
import {
  fetchLoginVolume,
  fetchMfaRate,
  fetchRiskDistribution,
  ApiError,
  type LoginVolumeBucket,
  type RiskDistributionBucket,
} from "@/lib/api";

type LoadState<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "empty" }
  | { status: "ready"; data: T };

/**
 * The three analytics endpoints this calls (login-volume, mfa-rate,
 * risk-distribution) are a contract agreed with the API owner but not
 * yet implemented server-side — see the PROPOSED ENDPOINTS comment in
 * lib/api.ts. Until they exist, every panel here will legitimately hit
 * its own error state below, which is the honest behavior rather than
 * something faked to look finished. No further frontend change should
 * be needed once the routes ship — this is written against the real
 * agreed shape already.
 */
export function OverviewAnalytics() {
  const [volume, setVolume] = useState<LoadState<LoginVolumeBucket[]>>({
    status: "loading",
  });
  const [mfaRate, setMfaRate] = useState<
    LoadState<{ rate: number; totalLogins: number }>
  >({ status: "loading" });
  const [distribution, setDistribution] = useState<
    LoadState<RiskDistributionBucket[]>
  >({ status: "loading" });

  const loadAll = () => {
    setVolume({ status: "loading" });
    fetchLoginVolume()
      .then((res) =>
        setVolume(
          res.buckets.length
            ? { status: "ready", data: res.buckets }
            : { status: "empty" }
        )
      )
      .catch((err) =>
        setVolume({
          status: "error",
          message:
            err instanceof ApiError
              ? err.message
              : "Couldn't load login volume.",
        })
      );

    setMfaRate({ status: "loading" });
    fetchMfaRate()
      .then((res) =>
        setMfaRate(
          res.totalLogins > 0
            ? { status: "ready", data: res }
            : { status: "empty" }
        )
      )
      .catch((err) =>
        setMfaRate({
          status: "error",
          message:
            err instanceof ApiError ? err.message : "Couldn't load MFA rate.",
        })
      );

    setDistribution({ status: "loading" });
    fetchRiskDistribution()
      .then((res) =>
        setDistribution(
          res.buckets.some((b) => b.count > 0)
            ? { status: "ready", data: res.buckets }
            : { status: "empty" }
        )
      )
      .catch((err) =>
        setDistribution({
          status: "error",
          message:
            err instanceof ApiError
              ? err.message
              : "Couldn't load risk distribution.",
        })
      );
  };

  useEffect(() => {
    loadAll();
  }, []);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card signal>
        <CardHeader>
          <CardTitle>Login volume</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {volume.status === "loading" && <ChartSkeleton />}
          {volume.status === "error" && <ChartErrorState onRetry={loadAll} />}
          {volume.status === "empty" && (
            <ChartEmptyState
              title="No activity yet"
              description="Login attempts will show up here once your app starts sending traffic."
            />
          )}
          {volume.status === "ready" && <LoginVolumeChart data={volume.data} />}
        </CardContent>
      </Card>

      <Card signal>
        <CardHeader>
          <CardTitle>Risk score distribution</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {distribution.status === "loading" && <ChartSkeleton />}
          {distribution.status === "error" && (
            <ChartErrorState onRetry={loadAll} />
          )}
          {distribution.status === "empty" && (
            <ChartEmptyState
              title="No scored logins yet"
              description="Risk scores will show up here once your app starts sending login attempts."
            />
          )}
          {distribution.status === "ready" && (
            <RiskDistributionChart data={distribution.data} />
          )}
        </CardContent>
      </Card>

      <Card className="p-6 lg:col-span-2">
        <p className="text-caption">MFA trigger rate</p>
        {mfaRate.status === "loading" && (
          <Skeleton className="mt-2 h-10 w-24" />
        )}
        {mfaRate.status === "error" && (
          <p className="text-caption mt-2 text-[var(--color-danger)]">
            {mfaRate.message}
          </p>
        )}
        {mfaRate.status === "empty" && (
          <p className="text-caption mt-2">No data yet.</p>
        )}
        {mfaRate.status === "ready" && (
          <p
            className="text-display-xl mt-1"
            style={{ color: riskColor(mfaRate.data.rate) }}
          >
            {(mfaRate.data.rate * 100).toFixed(1)}%
          </p>
        )}
      </Card>
    </div>
  );
}
