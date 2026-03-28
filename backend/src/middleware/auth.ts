import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

// ------------------------
// Types
// ------------------------
type UserRole = "ADMIN" | "STAFF" | "FACULTY" | "STUDENT";

interface AuthUser {
  id: number;
  role: UserRole;
}

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

// ------------------------
// Ensure JWT_SECRET exists (proper TS-safe way)
// ------------------------
if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is not defined in environment");
}

const JWT_SECRET = process.env.JWT_SECRET;

// ------------------------
// Type guard
// ------------------------
function isAuthPayload(payload: any): payload is AuthUser {
  return (
    payload &&
    typeof payload === "object" &&
    typeof payload.id === "number" &&
    ["ADMIN", "STAFF", "FACULTY", "STUDENT"].includes(payload.role)
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