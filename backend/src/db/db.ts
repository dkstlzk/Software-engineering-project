import { drizzle } from "drizzle-orm/node-postgres";
import pg, { type PoolConfig } from "pg";
import { env } from "../config/env";
import logger from "../shared/utils/logger";

const { Pool } = pg;

function buildPoolConfig(): PoolConfig {
  const poolConfig: PoolConfig = {
    connectionString: env.DATABASE_URL,
    max: env.DB_POOL_MAX,
    idleTimeoutMillis: env.DB_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: env.DB_CONNECTION_TIMEOUT_MS,
  };

  if (env.DATABASE_SSL) {
    poolConfig.ssl = {
      rejectUnauthorized: env.DATABASE_SSL_REJECT_UNAUTHORIZED,
    };
  }

  return poolConfig;
}

export const pool = new Pool(buildPoolConfig());

pool.on("error", (error: Error) => {
  logger.error("Unexpected PostgreSQL client error", {
    message: error.message,
    stack: error.stack,
  });
});

export const db = drizzle(pool);

export class DatabaseConnectionError extends Error {
  public readonly cause: unknown;

  constructor(message: string, cause: unknown) {
    super(message);
    this.name = "DatabaseConnectionError";
    this.cause = cause;
  }
}

function errorToMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export async function checkDatabaseConnection(): Promise<void> {
  try {
    await pool.query("SELECT 1");
  } catch (error) {
    logger.error("Database connectivity check failed", {
      error: errorToMessage(error),
    });

    throw new DatabaseConnectionError("Unable to connect to PostgreSQL", error);
  }
}
