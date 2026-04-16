import "dotenv/config";

import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const drizzleDir = path.resolve(__dirname, "../drizzle");
const journalPath = path.join(drizzleDir, "meta", "_journal.json");

function resolveDrizzleKitCommand() {
  const unixPath = path.resolve(__dirname, "../node_modules/.bin/drizzle-kit");
  const windowsPath = `${unixPath}.cmd`;
  const resolved = process.platform === "win32" ? windowsPath : unixPath;

  if (!fs.existsSync(resolved)) {
    console.error(
      "Missing local drizzle-kit binary. Install dev dependencies (for Render use: npm ci --include=dev).",
    );
    process.exit(1);
  }

  return resolved;
}

function runDrizzleKit(args) {
  const command = resolveDrizzleKitCommand();
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
  });

  if (result.error) {
    throw new Error(result.error.message);
  }

  const status = result.status ?? 1;

  if (status !== 0) {
    process.exit(status);
  }
}

async function hasUserTables(databaseUrl) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const result = await client.query(`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
      ) AS has_tables;
    `);

    return Boolean(result.rows[0]?.has_tables);
  } finally {
    await client.end();
  }
}

function readLatestMigrationMetadata() {
  if (!fs.existsSync(journalPath)) {
    throw new Error(`Missing migration journal: ${journalPath}`);
  }

  const journalRaw = fs.readFileSync(journalPath, "utf8");
  const journal = JSON.parse(journalRaw);
  const entries = Array.isArray(journal.entries) ? journal.entries : [];

  if (entries.length === 0) {
    return null;
  }

  const latest = entries[entries.length - 1];
  const tag = latest?.tag;
  const when = latest?.when;

  if (typeof tag !== "string" || tag.length === 0 || typeof when !== "number") {
    throw new Error("Invalid latest migration entry in drizzle meta journal");
  }

  const sqlPath = path.join(drizzleDir, `${tag}.sql`);

  if (!fs.existsSync(sqlPath)) {
    throw new Error(`Missing migration SQL file: ${sqlPath}`);
  }

  const sql = fs.readFileSync(sqlPath, "utf8");
  const hash = crypto.createHash("sha256").update(sql).digest("hex");

  return {
    tag,
    when,
    hash,
  };
}

async function ensureMigrationBaselineIfMissing(databaseUrl) {
  const latest = readLatestMigrationMetadata();

  if (!latest) {
    return false;
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query("CREATE SCHEMA IF NOT EXISTS drizzle");
    await client.query(`
      CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )
    `);

    const lastApplied = await client.query(
      "SELECT created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1",
    );

    if (lastApplied.rows.length > 0) {
      return false;
    }

    await client.query(
      "INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)",
      [latest.hash, latest.when],
    );

    console.log(
      `No drizzle migration metadata found. Baseline set at ${latest.tag}.`,
    );

    return true;
  } finally {
    await client.end();
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error("DATABASE_URL is required for schema deployment");
    process.exit(1);
  }

  const nonEmptySchema = await hasUserTables(databaseUrl);

  if (!nonEmptySchema) {
    console.log("Public schema is empty; running first-deploy push workflow.");
    runDrizzleKit(["push", "--force"]);
    await ensureMigrationBaselineIfMissing(databaseUrl);
    return;
  }

  await ensureMigrationBaselineIfMissing(databaseUrl);
  console.log("Existing schema detected; running drizzle-kit migrate.");
  runDrizzleKit(["migrate"]);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
