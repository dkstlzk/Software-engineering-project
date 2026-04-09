import { spawnSync } from "node:child_process";
import pg from "pg";

const { Client } = pg;

async function hasUserTables(databaseUrl) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const query = `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
          AND table_name NOT IN ('__drizzle_migrations', '__drizzle_migrations_lock')
      ) AS has_tables;
    `;

    const result = await client.query(query);
    return Boolean(result.rows[0]?.has_tables);
  } finally {
    await client.end();
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error("DATABASE_URL is required for first-deploy schema sync");
    process.exit(1);
  }

  const nonEmptySchema = await hasUserTables(databaseUrl);

  if (nonEmptySchema) {
    console.log("Detected existing tables in public schema; skipping forced db push.");
    process.exit(0);
  }

  console.log("Public schema is empty; running drizzle-kit push --force for first deployment.");

  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(command, ["drizzle-kit", "push", "--force"], {
    stdio: "inherit",
    env: process.env,
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  process.exit(result.status ?? 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});