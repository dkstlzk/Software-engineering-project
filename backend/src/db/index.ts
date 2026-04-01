import "../config/env";

import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";
import { env } from "../config/env";

const { Pool } = pkg;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
});

export const db = drizzle(pool);