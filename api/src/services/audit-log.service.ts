import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { riskLogs, users } from "../db/schema";
import { adminDb } from "../db";

export interface AuditLogFilters {
  eventType?: string;
  fromDate?: Date;
  toDate?: Date;
  page: number;
  limit: number;
}
export interface AuditLogEntry {
  id: string;
  eventType: string;
  mfaTriggered: boolean;
  riskScore: number | null;
  ipAddress: string | null;
  userAgent: string | null;
  fingerprint: string | null;
  geoLat: string | null;
  geoLng: string | null;
  features: Record<string, number> | null;
  userEmail: string | null;
  createdAt: Date;
}

export interface AuditLogPage {
  entries: AuditLogEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export async function getAuditLogs(
  tenantId: string,
  filters: AuditLogFilters
): Promise<AuditLogPage> {
  const { eventType, fromDate, toDate, page, limit } = filters;
  const conditions = [eq(riskLogs.tenantId, tenantId)];
  if (eventType) {
    conditions.push(eq(riskLogs.eventType, eventType));
  }
  if (fromDate) {
    conditions.push(gte(riskLogs.createdAt, fromDate));
  }
  if (toDate) {
    conditions.push(lte(riskLogs.createdAt, toDate));
  }
  const where = and(...conditions);
  const offset = (page - 1) * limit;

  //Fetching page results
  const entries = await adminDb
    .select({
      id: riskLogs.id,
      eventType: riskLogs.eventType,
      riskScore: riskLogs.riskScore,
      mfaTriggered: riskLogs.mfaTriggered,
      ipAddress: riskLogs.ipAddress,
      userAgent: riskLogs.userAgent,
      fingerprint: riskLogs.fingerprint,
      geoLat: riskLogs.geoLat,
      geoLng: riskLogs.geoLng,
      features: riskLogs.features,
      userEmail: users.email,
      createdAt: riskLogs.createdAt,
    })
    .from(riskLogs)
    .leftJoin(users, eq(riskLogs.userId, users.id))
    .where(where)
    .orderBy(desc(riskLogs.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ count }] = await adminDb
    .select({ count: sql<number>`count(*)::int` })
    .from(riskLogs)
    .where(where);

  return {
    entries: entries as AuditLogEntry[],
    total: count,
    page,
    limit,
    totalPages: Math.ceil(count / limit),
  };
}
