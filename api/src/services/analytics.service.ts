import { and, eq, gte, lte, sql, inArray } from "drizzle-orm";
import { adminDb } from "../db";
import { riskLogs } from "../db/schema";

// Event types that count as a login attempt
const LOGIN_ATTEMPT_EVENTS = ["login_success", "login_failed", "mfa_triggered"] as const;

// ─── Login Volume ────────────────────────────────────────────────────────────

export interface LoginVolumeBucket {
  date: string;
  count: number;
}

export interface LoginVolumeResult {
  buckets: LoginVolumeBucket[];
}

export async function getLoginVolume(
  tenantId: string,
  fromDate?: Date,
  toDate?: Date,
  granularity: "hour" | "day" | "week" | "month" = "day"
): Promise<LoginVolumeResult> {
  const conditions = [
    eq(riskLogs.tenantId, tenantId),
    inArray(riskLogs.eventType, [...LOGIN_ATTEMPT_EVENTS]),
  ];

  if (fromDate) conditions.push(gte(riskLogs.createdAt, fromDate));
  if (toDate) conditions.push(lte(riskLogs.createdAt, toDate));

  // granularity must be a SQL keyword literal — use sql.raw so Postgres
  // receives it inline rather than as a bound parameter ($1).
  const truncExpr = sql`date_trunc(${sql.raw(`'${granularity}'`)}, ${riskLogs.createdAt})`;

  const rows = await adminDb
    .select({
      date: sql<string>`${truncExpr}::text`,
      count: sql<number>`count(*)::int`,
    })
    .from(riskLogs)
    .where(and(...conditions))
    .groupBy(truncExpr)
    .orderBy(truncExpr);

  return { buckets: rows };
}

// ─── MFA Rate ────────────────────────────────────────────────────────────────

export interface MfaRateResult {
  totalLogins: number;
  mfaTriggeredCount: number;
  rate: number;
}

export async function getMfaRate(
  tenantId: string,
  fromDate?: Date,
  toDate?: Date
): Promise<MfaRateResult> {
  const baseConditions = [
    eq(riskLogs.tenantId, tenantId),
    inArray(riskLogs.eventType, [...LOGIN_ATTEMPT_EVENTS]),
  ];
  if (fromDate) baseConditions.push(gte(riskLogs.createdAt, fromDate));
  if (toDate) baseConditions.push(lte(riskLogs.createdAt, toDate));

  const [{ total }] = await adminDb
    .select({ total: sql<number>`count(*)::int` })
    .from(riskLogs)
    .where(and(...baseConditions));

  const mfaConditions = [
    eq(riskLogs.tenantId, tenantId),
    eq(riskLogs.eventType, "mfa_triggered"),
  ];
  if (fromDate) mfaConditions.push(gte(riskLogs.createdAt, fromDate));
  if (toDate) mfaConditions.push(lte(riskLogs.createdAt, toDate));

  const [{ mfaCount }] = await adminDb
    .select({ mfaCount: sql<number>`count(*)::int` })
    .from(riskLogs)
    .where(and(...mfaConditions));

  return {
    totalLogins: total,
    mfaTriggeredCount: mfaCount,
    rate: total === 0 ? 0 : Math.round((mfaCount / total) * 10000) / 10000,
  };
}

// ─── Risk Distribution ───────────────────────────────────────────────────────

const RISK_BANDS = [
  { min: 0, max: 0.2 },
  { min: 0.2, max: 0.4 },
  { min: 0.4, max: 0.6 },
  { min: 0.6, max: 0.8 },
  { min: 0.8, max: 1.0 },
] as const;

export interface RiskBucket {
  min: number;
  max: number;
  count: number;
}

export interface RiskDistributionResult {
  buckets: RiskBucket[];
}

export async function getRiskDistribution(
  tenantId: string,
  fromDate?: Date,
  toDate?: Date
): Promise<RiskDistributionResult> {
  const conditions = [
    eq(riskLogs.tenantId, tenantId),
    sql`${riskLogs.riskScore} IS NOT NULL`,
  ];
  if (fromDate) conditions.push(gte(riskLogs.createdAt, fromDate));
  if (toDate) conditions.push(lte(riskLogs.createdAt, toDate));

  // Fetch all relevant risk scores in one query and bucket client-side
  // (avoids complex CASE WHEN SQL while keeping a single round-trip)
  const rows = await adminDb
    .select({ riskScore: riskLogs.riskScore })
    .from(riskLogs)
    .where(and(...conditions));

  const counts = new Map<number, number>(RISK_BANDS.map((b) => [b.min, 0]));

  for (const { riskScore } of rows) {
    if (riskScore === null) continue;
    const band = RISK_BANDS.find(
      (b) => riskScore >= b.min && riskScore <= b.max
    );
    if (band) {
      counts.set(band.min, (counts.get(band.min) ?? 0) + 1);
    }
  }

  return {
    buckets: RISK_BANDS.map((b) => ({
      min: b.min,
      max: b.max,
      count: counts.get(b.min) ?? 0,
    })),
  };
}
