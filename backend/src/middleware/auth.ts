import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import type { UserRole } from "../auth/jwt";

// ------------------------
// Types
// ------------------------
interface AuthPayload {
  id: number;
  role: UserRole;
}

// Extend Express Request
declare global {
  namespace Express {
    interface User {
      id: number;
      role: UserRole;
    }
  }
}

// ------------------------
// Ensure JWT_SECRET exists (proper TS-safe way)
// ------------------------
const JWT_SECRET = env.JWT_SECRET;

// ------------------------
// Type guard
// ------------------------
function isAuthPayload(payload: any): payload is AuthPayload {
  return (
    payload &&
    typeof payload === "object" &&
    typeof payload.id === "number" &&
    ["ADMIN", "STAFF", "FACULTY", "STUDENT", "PENDING_ROLE"].includes(
      payload.role,
    )
  );
}

// ------------------------
// Middleware
// ------------------------
export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const header = req.headers.authorization;

    // 1. Check header
    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // 2. Extract token
    const token = header.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // 3. Verify token
    const decoded = jwt.verify(token, JWT_SECRET);

    // 4. Validate payload
    if (!isAuthPayload(decoded)) {
      return res.status(401).json({ error: "Invalid token payload" });
    }

    // 5. Attach user
    req.user = {
      id: decoded.id,
      role: decoded.role,
    };

    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}