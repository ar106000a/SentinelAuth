import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { otpTokens, riskLogs, sessions, users } from "../db/schema";
import { adminDb } from "../db";
import { NotFoundError } from "../utils/error";

//List users
export interface UserListFeatures {
  search?: string;
  page: number;
  limit: number;
}
export interface UserListEntry {
  id: string;
  email: string;
  isVerified: boolean;
  mfaEnabled: boolean;
  lastLoginAt: Date | null;
  lastLoginIp: string | null;
  createdAt: Date;
}
export interface UserListPage {
  entries: UserListEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export async function listTenantUsers(
  tenantId: string,
  filters: UserListFeatures
): Promise<UserListPage> {
  const { search, page, limit } = filters;
  const offset = (page - 1) * limit;

  const conditions = [eq(users.tenantId, tenantId)];
  if (search) {
    conditions.push(ilike(users.email, `%${search}%`));
  }
  const where = and(...conditions);
  const entries = await adminDb
    .select({
      id: users.id,
      email: users.email,
      isVerified: users.isVerified,
      mfaEnabled: users.mfaEnabled,
      lastLoginAt: users.lastLoginAt,
      lastLoginIp: users.lastLoginIp,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(where)
    .orderBy(desc(users.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ count }] = await adminDb
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(where);

  return {
    entries,
    total: count,
    page,
    limit,
    totalPages: Math.ceil(count / limit),
  };
}

//Deleting user
export interface GdprDeleteResult {
  userId: string;
  message: string;
}
export async function gdprDeleteUser(
  tenantId: string,
  userId: string
): Promise<GdprDeleteResult> {
  //verifying user belongs to this tenant
  const [user] = await adminDb
    .select({ userId: users.id })
    .from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.id, userId)))
    .limit(1);

  if (!user) {
    throw new NotFoundError("User");
  }

  await adminDb
    .update(sessions)
    .set({ isRevoked: true })
    .where(and(eq(sessions.tenantId, tenantId), eq(sessions.userId, userId)));

  //Delete otp tokens(personal data)
  await adminDb
    .delete(otpTokens)
    .where(and(eq(otpTokens.userId, userId), eq(otpTokens.tenantId, tenantId)));

  //Nullify the user in risk logs, retain the information
  await adminDb
    .update(riskLogs)
    .set({ userId: null })
    .where(and(eq(riskLogs.userId, userId), eq(riskLogs.tenantId, tenantId)));

  //deleting user record - cascades to sessions
  await adminDb
    .delete(users)
    .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)));

  //Log the GDPR deleteion event

  await adminDb.insert(riskLogs).values({
    tenantId,
    userId: null,
    eventType: "gpr_user_deleted",
    mfaTriggered: false,
  });

  return {
    userId,
    message: "User data has been permanently deleted in compliance with GDPR.",
  };
}
