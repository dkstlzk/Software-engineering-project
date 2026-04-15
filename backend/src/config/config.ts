import dotenv from "dotenv";

type NodeEnv = "development" | "test" | "production";

if (!process.env.TZ || process.env.TZ.trim().length === 0) {
  process.env.TZ = "Asia/Kolkata";
}

dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is not defined in environment`);
  }

  return value;
}

function optionalEnv(name: string): string | null {
  const value = process.env[name];

  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function optionalIntEnv(name: string): number | null {
  const value = optionalEnv(name);

  if (value === null) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function optionalBooleanEnv(name: string): boolean | null {
  const value = optionalEnv(name);

  if (value === null) {
    return null;
  }

  const normalized = value.toLowerCase();

  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }

  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }

  return null;
}

function readPort(): number {
  const raw = process.env.PORT?.trim();

  if (!raw) {
    return 5000;
  }

  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return 5000;
  }

  return parsed;
}

function parseNodeEnv(raw: string | undefined): NodeEnv {
  if (raw === "production" || raw === "test") {
    return raw;
  }

  return "development";
}

function parseCorsOrigins(frontendUrl: string): string[] {
  const configured = optionalEnv("CORS_ORIGINS");

  if (!configured) {
    return [frontendUrl];
  }

  const values = configured
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter((value) => value.length > 0);

  if (values.length === 0) {
    return [frontendUrl];
  }

  return Array.from(new Set(values));
}

const NODE_ENV = parseNodeEnv(process.env.NODE_ENV);
const FRONTEND_URL = (optionalEnv("FRONTEND_URL") ?? "http://localhost:5173").replace(
  /\/$/,
  "",
);

const SESSION_SECRET = optionalEnv("SESSION_SECRET");

if (NODE_ENV === "production" && SESSION_SECRET === null) {
  throw new Error("SESSION_SECRET is required in production");
}

const DATABASE_SSL = optionalBooleanEnv("DATABASE_SSL") ?? NODE_ENV === "production";
const DATABASE_SSL_REJECT_UNAUTHORIZED =
  optionalBooleanEnv("DATABASE_SSL_REJECT_UNAUTHORIZED") ?? false;

export const env = {
  NODE_ENV,
  PORT: readPort(),
  DATABASE_URL: requireEnv("DATABASE_URL"),
  DATABASE_SSL,
  DATABASE_SSL_REJECT_UNAUTHORIZED,
  DB_POOL_MAX: optionalIntEnv("DB_POOL_MAX") ?? 20,
  DB_IDLE_TIMEOUT_MS: optionalIntEnv("DB_IDLE_TIMEOUT_MS") ?? 30_000,
  DB_CONNECTION_TIMEOUT_MS: optionalIntEnv("DB_CONNECTION_TIMEOUT_MS") ?? 10_000,
  REDIS_URL: optionalEnv("REDIS_URL"),
  JWT_SECRET: requireEnv("JWT_SECRET"),
  GOOGLE_CLIENT_ID: optionalEnv("GOOGLE_CLIENT_ID"),
  GOOGLE_CLIENT_SECRET: optionalEnv("GOOGLE_CLIENT_SECRET"),
  GOOGLE_CALLBACK_URL: optionalEnv("GOOGLE_CALLBACK_URL"),
  SESSION_SECRET,
  SMTP_HOST: optionalEnv("SMTP_HOST"),
  SMTP_PORT: optionalIntEnv("SMTP_PORT"),
  SMTP_USER: optionalEnv("SMTP_USER"),
  SMTP_PASS: optionalEnv("SMTP_PASS"),
  SMTP_FROM: optionalEnv("SMTP_FROM"),
  SMTP_SECURE: optionalBooleanEnv("SMTP_SECURE"),
  FRONTEND_URL,
  CORS_ORIGINS: parseCorsOrigins(FRONTEND_URL),
  CACHE_VERY_SHORT_TTL: optionalIntEnv("CACHE_VERY_SHORT_TTL") ?? 120,
  CACHE_SHORT_TTL: optionalIntEnv("CACHE_SHORT_TTL") ?? 300,
  CACHE_MEDIUM_TTL: optionalIntEnv("CACHE_MEDIUM_TTL") ?? 1800,
  CACHE_LONG_TTL: optionalIntEnv("CACHE_LONG_TTL") ?? 3600,
  CACHE_VERY_LONG_TTL: optionalIntEnv("CACHE_VERY_LONG_TTL") ?? 7200,
} as const;

export const isGoogleOAuthConfigured =
  env.GOOGLE_CLIENT_ID !== null &&
  env.GOOGLE_CLIENT_SECRET !== null &&
  env.GOOGLE_CALLBACK_URL !== null;
