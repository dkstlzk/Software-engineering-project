import { Request, Response, NextFunction } from "express";
import type { UserRole } from "../auth/jwt";

// ------------------------
// RBAC Middleware
// ------------------------
export function requireRole(allowedRoles: UserRole | UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;

    // Must be authenticated first
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const roles = Array.isArray(allowedRoles)
      ? allowedRoles
      : [allowedRoles];

    if (!roles.includes(user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    next();
  };
}