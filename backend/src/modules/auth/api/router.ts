import { type Request, type Response, Router } from "express";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import passport from "../../../auth/passport";
import { signAuthToken, signRefreshToken, verifySetupToken, verifyRefreshToken } from "../../../auth/jwt";
import { env, isGoogleOAuthConfigured } from "../../../config/env";
import { db } from "../../../db";
import { users, buildings, staffBuildingAssignments } from "../../../db/schema";
import { authMiddleware } from "../../../middleware/auth";
import logger from "../../../shared/utils/logger";

const router = Router();

type SetupRole = "STUDENT";

function buildFrontendUrl(pathname: string, params?: Record<string, string>): string {
  const normalizedBase = env.FRONTEND_URL.endsWith("/")
    ? env.FRONTEND_URL
    : `${env.FRONTEND_URL}/`;

  const url = new URL(pathname, normalizedBase);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}

function getOAuthFailedRedirectUrl(): string {
  return buildFrontendUrl("/login", { error: "oauth_failed" });
}

function readBearerToken(req: Request): string | null {
  const rawHeader = req.headers.authorization;

  if (!rawHeader || !rawHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = rawHeader.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

async function cleanupOAuthSession(req: Request, res: Response): Promise<void> {
  await new Promise<void>((resolve) => {
    const destroySession = () => {
      if (!req.session) {
        resolve();
        return;
      }

      req.session.destroy((destroyError) => {
        if (destroyError) {
          logger.error(destroyError);
        }

        resolve();
      });
    };

    if (typeof req.logout === "function") {
      req.logout((logoutError) => {
        if (logoutError) {
          logger.error(logoutError);
        }

        destroySession();
      });

      return;
    }

    destroySession();
  });

  res.clearCookie("connect.sid");
}

// ------------------------
// POST /auth/login
// ------------------------
router.post("/login", async (req, res) => {
  try {
    const email = req.body?.email?.trim()?.toLowerCase();
    const password = req.body?.password;
    const authProvider = req.body?.authProvider ?? "email";

    // Validation: email required for both methods
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    // Email domain validation
    if (!email.endsWith("@iitj.ac.in")) {
      return res.status(400).json({
        message: "Please use your @iitj.ac.in email address",
      });
    }

    // Password required only for email auth
    if (authProvider === "email" && !password) {
      return res.status(400).json({ message: "Password is required for email login" });
    }

    // Find user
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    const user = rows[0];

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Check if user's registered method matches auth provider
    if (authProvider === "email" && user.registeredVia === "google") {
      return res.status(403).json({
        message: "This account uses Google login. Please continue with Google.",
      });
    }

    if (authProvider === "google" && user.registeredVia === "email") {
      return res.status(403).json({
        message: "This account uses email/password login. Please use email and password.",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: "Your account is inactive" });
    }

    if (user.role === "PENDING_ROLE") {
      return res.status(403).json({
        message: "Account setup is incomplete. Complete role setup first.",
      });
    }

    // Password validation for email auth only
    if (authProvider === "email") {
      const isMatch = await bcrypt.compare(password, user.passwordHash);

      if (!isMatch) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
    }

    // Generate JWT tokens
    const accessToken = signAuthToken({ id: user.id, role: user.role });
    const refreshToken = signRefreshToken({ id: user.id, role: user.role });

    return res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.displayName ?? user.name,
        role: user.role,
      },
      authProvider,
    });

  } catch (error) {
    logger.error(error);
    return res.status(500).json({ message: "Login failed" });
  }
});

// ------------------------
// GET /auth/me
// ------------------------
router.get("/me", authMiddleware, async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const rows = await db
      .select()
      .from(users)
      .where(eq(users.id, req.user.id))
      .limit(1);

    const user = rows[0];

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: "Your account is inactive" });
    }

    // Fetch assigned buildings if user is STAFF
    let assignedBuildings: Array<{ id: number; name: string }> = [];
    if (user.role === "STAFF") {
      const buildingRows = await db
        .select({
          id: buildings.id,
          name: buildings.name,
        })
        .from(buildings)
        .innerJoin(
          staffBuildingAssignments,
          eq(buildings.id, staffBuildingAssignments.buildingId)
        )
        .where(eq(staffBuildingAssignments.staffId, user.id));

      assignedBuildings = buildingRows;
    }

    return res.json({
      id: user.id,
      name: user.displayName ?? user.name,
      email: user.email,
      role: user.role,
      department: user.department,
      avatarUrl: user.avatarUrl,
      registeredVia: user.registeredVia,
      buildings: assignedBuildings,
    });
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ message: "Failed to fetch current user" });
  }
});

if (isGoogleOAuthConfigured) {
  router.get(
    "/google",
    passport.authenticate("google", {
      scope: ["profile", "email"],
      session: true,
    }),
  );

  router.get("/google/callback", (req, res, next) => {
    passport.authenticate(
      "google",
      { session: true },
      async (error: unknown, authenticatedUser: Express.User | false) => {
        const failedRedirect = getOAuthFailedRedirectUrl();

        if (error || !authenticatedUser) {
          if (error) {
            logger.error(error);
          }

          await cleanupOAuthSession(req, res);
          return res.redirect(failedRedirect);
        }

        const user = authenticatedUser as typeof users.$inferSelect;

        try {
          if (!user.isActive) {
            await cleanupOAuthSession(req, res);
            return res.redirect(failedRedirect);
          }

          let effectiveUser = user;

          if (effectiveUser.role === "PENDING_ROLE") {
            const [updated] = await db
              .update(users)
              .set({
                role: "STUDENT",
                firstLogin: true,
              })
              .where(eq(users.id, effectiveUser.id))
              .returning();

            if (updated) {
              effectiveUser = updated;
            }
          }

          let redirectUrl: string;

          if (effectiveUser.firstLogin) {
            const accessToken = signAuthToken({ id: effectiveUser.id, role: effectiveUser.role });
            const refreshToken = signRefreshToken({ 
              id: effectiveUser.id, 
              role: effectiveUser.role as Exclude<typeof effectiveUser.role, "PENDING_ROLE">
            });

            await db
              .update(users)
              .set({ firstLogin: false })
              .where(eq(users.id, effectiveUser.id));

            redirectUrl = buildFrontendUrl("/auth/callback", {
              accessToken,
              refreshToken,
              firstLogin: "true",
              role: effectiveUser.role,
              authProvider: "google",
            });
          } else {
            const accessToken = signAuthToken({ id: effectiveUser.id, role: effectiveUser.role });
            const refreshToken = signRefreshToken({ 
              id: effectiveUser.id, 
              role: effectiveUser.role as Exclude<typeof effectiveUser.role, "PENDING_ROLE">
            });
            redirectUrl = buildFrontendUrl("/auth/callback", { 
              accessToken, 
              refreshToken,
              authProvider: "google",
            });
          }

          await cleanupOAuthSession(req, res);
          return res.redirect(redirectUrl);
        } catch (callbackError) {
          logger.error(callbackError);
          await cleanupOAuthSession(req, res);
          return res.redirect(failedRedirect);
        }
      },
    )(req, res, next);
  });

  router.get("/google/failed", async (req, res) => {
    await cleanupOAuthSession(req, res);
    return res.redirect(getOAuthFailedRedirectUrl());
  });
} else {
  router.get("/google", (_req, res) => {
    return res.status(503).json({ message: "Google OAuth is not configured" });
  });

  router.get("/google/callback", (_req, res) => {
    return res.status(503).json({ message: "Google OAuth is not configured" });
  });

  router.get("/google/failed", (_req, res) => {
    return res.status(503).json({ message: "Google OAuth is not configured" });
  });
}

// ------------------------
// POST /auth/complete-setup
// ------------------------
router.post("/complete-setup", async (req, res) => {
  try {
    const token = readBearerToken(req);

    if (!token) {
      return res.status(401).json({ message: "Setup token is required" });
    }

    const decoded = verifySetupToken(token);

    if (!decoded) {
      return res.status(401).json({ message: "Invalid or expired setup token" });
    }

    const role = req.body?.role as string | undefined;
    const rawDepartment = req.body?.department;

    const rows = await db
      .select()
      .from(users)
      .where(eq(users.id, decoded.id))
      .limit(1);

    const user = rows[0];

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: "Your account is inactive" });
    }

    if (user.role !== "PENDING_ROLE") {
      return res.status(400).json({
        message: "Setup has already been completed for this account",
      });
    }

    // First-login setup is intentionally student-only.
    const allowedRoles = ["STUDENT"] as const;

    if (role !== "STUDENT") {
      return res.status(400).json({
        message: `role must be one of: ${allowedRoles.join(", ")}`,
      });
    }

    if (rawDepartment !== undefined && typeof rawDepartment !== "string") {
      return res.status(400).json({
        message: "department must be a string when provided",
      });
    }

    const department =
      typeof rawDepartment === "string" && rawDepartment.trim().length > 0
        ? rawDepartment.trim()
        : null;

    const [updated] = await db
      .update(users)
      .set({
        role: role as SetupRole,
        department,
        firstLogin: false,
      })
      .where(eq(users.id, user.id))
      .returning();

    if (!updated) {
      return res.status(500).json({ message: "Failed to complete setup" });
    }

    const accessToken = signAuthToken({ id: updated.id, role: updated.role });
    const refreshToken = signRefreshToken({ id: updated.id, role: updated.role as Exclude<typeof updated.role, "PENDING_ROLE"> });

    return res.json({
      accessToken,
      refreshToken,
      user: {
        id: updated.id,
        name: updated.displayName ?? updated.name,
        role: updated.role,
      },
    });
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ message: "Complete setup failed" });
  }
});

// ------------------------
// POST /auth/refresh
// ------------------------
router.post("/refresh", async (req, res) => {
  try {
    const refreshToken = req.body?.refreshToken;

    if (!refreshToken) {
      return res.status(400).json({ message: "Refresh token is required" });
    }

    const decoded = verifyRefreshToken(refreshToken);

    if (!decoded) {
      return res.status(401).json({ message: "Invalid or expired refresh token" });
    }

    const rows = await db
      .select()
      .from(users)
      .where(eq(users.id, decoded.id))
      .limit(1);

    const user = rows[0];

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: "Your account is inactive" });
    }

    const accessToken = signAuthToken({ id: user.id, role: user.role });
    const newRefreshToken = signRefreshToken({ 
      id: user.id, 
      role: user.role as Exclude<typeof user.role, "PENDING_ROLE">
    });

    return res.json({
      accessToken,
      refreshToken: newRefreshToken,
      user: {
        id: user.id,
        name: user.displayName ?? user.name,
        role: user.role,
      },
    });
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ message: "Token refresh failed" });
  }
});

export default router;