import { adminPool } from "./index";
import { SecurityViolationError } from "../utils/error";

const REQUIRED_TABLES = [
  "users",
  "sessions",
  "otp_tokens",
  "risk_logs",
  "device_fingerprints",
] as const;

export async function assertRlsEnabled(): Promise<void> {
  const { rows } = await adminPool.query(
    `SELECT relname, relrowsecurity, relforcerowsecurity
     FROM pg_class
     WHERE relname = ANY($1)`,
    [REQUIRED_TABLES]
  );

  const missing = REQUIRED_TABLES.filter(
    (tableName) => !rows.some((row) => row.relname === tableName)
  );

  const broken = rows.filter(
    (row) => !row.relrowsecurity || !row.relforcerowsecurity
  );

  const offenders = [
    ...missing.map((name) => `${name}: missing table`),
    ...broken.map(
      (row) =>
        `${row.relname}: rls=${Boolean(row.relrowsecurity)}, force=${Boolean(row.relforcerowsecurity)}`
    ),
  ];

  if (offenders.length > 0) {
    throw new SecurityViolationError(
      `FATAL: RLS is not enforced on: ${offenders.join(", ")}`
    );
  }
}
