// import "dotenv/config";
import { pool } from "../db";


afterAll(async () => {
  await pool.end();
});