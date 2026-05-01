// import "dotenv/config";
import { pool, adminPool } from "../db";

afterAll(async () => {
  await pool.end();
  await adminPool.end();
});
