import jwt from "jsonwebtoken";
import { env } from "../config/env";

export type UserRole =
  | "ADMIN"
  | "STAFF"
  | "FACULTY"
  | "STUDENT"
  | "PENDING_ROLE";

export type LoginRole = Exclude<UserRole, "PENDING_ROLE">;

export type SetupTokenPayload = {
  id: number;
  role: "PENDING_ROLE";
  setupRequired: true;
};

export type AuthTokenPayload = {
  id: number;
  role: LoginRole;
  type: "access" | "refresh";
};

function isSetupTokenPayload(payload: unknown): payload is SetupTokenPayload {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const candidate = payload as Partial<SetupTokenPayload>;

  return (
    typeof candidate.id === "number" &&
    candidate.role === "PENDING_ROLE" &&
    candidate.setupRequired === true
  );
}

export function signAuthToken(user: { id: number; role: UserRole }): string {
  if (user.role === "PENDING_ROLE") {
    throw new Error("Cannot issue login token for PENDING_ROLE");
  }

  return jwt.sign(
    {
      id: user.id,
      role: user.role,
      type: "access",
    },
    env.JWT_SECRET,
    { expiresIn: "15m" },
  );
}

export function signRefreshToken(user: { id: number; role: LoginRole }): string {
  return jwt.sign(
    {
      id: user.id,
      role: user.role,
      type: "refresh",
    },
    env.JWT_SECRET,
    { expiresIn: "7d" },
  );
}

export function verifyAuthToken(token: string): AuthTokenPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as any;

    if (
      typeof decoded.id === "number" &&
      typeof decoded.role === "string" &&
      decoded.type === "access"
    ) {
      return decoded as AuthTokenPayload;
    }

    return null;
  } catch {
    return null;
  }
}

export function verifyRefreshToken(token: string): AuthTokenPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as any;

    if (
      typeof decoded.id === "number" &&
      typeof decoded.role === "string" &&
      decoded.type === "refresh"
    ) {
      return decoded as AuthTokenPayload;
    }

    return null;
  } catch {
    return null;
  }
}

export function signSetupToken(userId: number): string {
  return jwt.sign(
    {
      id: userId,
      role: "PENDING_ROLE",
      setupRequired: true,
    },
    env.JWT_SECRET,
    { expiresIn: "15m" },
  );
}

export function verifySetupToken(token: string): SetupTokenPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);

    if (!isSetupTokenPayload(decoded)) {
      return null;
    }

    return decoded;
  } catch {
    return null;
  }
}
