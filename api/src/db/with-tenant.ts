import { pool } from "./index";
import { PoolClient } from "pg";

/**
 * Executes a callback within a PostgreSQL transaction where
 * app.current_tenant is set for the duration of the transaction.
 * RLS policies use this setting to scope all queries automatically.
 */
export async function withTenant<T>(
  tenantId: string,
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Set the tenant context — RLS policies read this
    await client.query("SELECT set_config('app.current_tenant', $1, true)", [
      tenantId,
    ]); //the true as the third argument is set_local, which means the connection ll remember this variable only within this transaction, when the connection ll go back to the pool, it wont remember it anymore, no session bleeding...

    const result = await callback(client);

    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
