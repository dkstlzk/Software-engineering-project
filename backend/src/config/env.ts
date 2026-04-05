import dotenv from "dotenv";

dotenv.config();

function requireEnv(name: string): string {
	const value = process.env[name];

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

export const env = {
	NODE_ENV: process.env.NODE_ENV ?? "development",
	PORT: readPort(),
	DATABASE_URL: requireEnv("DATABASE_URL"),
	JWT_SECRET: requireEnv("JWT_SECRET"),
	GOOGLE_CLIENT_ID: optionalEnv("GOOGLE_CLIENT_ID"),
	GOOGLE_CLIENT_SECRET: optionalEnv("GOOGLE_CLIENT_SECRET"),
	GOOGLE_CALLBACK_URL: optionalEnv("GOOGLE_CALLBACK_URL"),
	SESSION_SECRET: optionalEnv("SESSION_SECRET"),
	SMTP_HOST: optionalEnv("SMTP_HOST"),
	SMTP_PORT: optionalIntEnv("SMTP_PORT"),
	SMTP_USER: optionalEnv("SMTP_USER"),
	SMTP_PASS: optionalEnv("SMTP_PASS"),
	SMTP_FROM: optionalEnv("SMTP_FROM"),
	SMTP_SECURE: optionalBooleanEnv("SMTP_SECURE"),
	FRONTEND_URL: (optionalEnv("FRONTEND_URL") ?? "http://localhost:5173").replace(
		/\/$/, "",
	),
};

export const isGoogleOAuthConfigured =
	env.GOOGLE_CLIENT_ID !== null &&
	env.GOOGLE_CLIENT_SECRET !== null &&
	env.GOOGLE_CALLBACK_URL !== null;