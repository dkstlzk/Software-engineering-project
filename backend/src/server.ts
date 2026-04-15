import "./config/env"; // load env FIRST

import connectPgSimple from "connect-pg-simple";
import cors from "cors";
import express from "express";
import session from "express-session";
import type { Server } from "node:http";
import passport from "./auth/passport";
import { env } from "./config/env";
import { checkDatabaseConnection, pool } from "./db";
import { generalLimiter, authLimiter } from "./api/middleware/rateLimit.middleware";
import { markInternalOperation } from "./api/middleware/internalOperation.middleware";
import { requestLogger } from "./api/middleware/requestLogger.middleware";
import { performanceMiddleware } from "./api/middleware/performance.middleware";
import healthRouter from "./api/routes/health.routes";
import { errorHandler } from "./api/middleware/errorHandler.middleware";
import { apiModules } from "./modules";
import { registerModules } from "./modules/registerModules";
import logger from "./shared/utils/logger";

const app = express();
const PORT = env.PORT;
const sessionSecret = env.SESSION_SECRET ?? env.JWT_SECRET;
const isProduction = env.NODE_ENV === "production";
const allowedOrigins = new Set(env.CORS_ORIGINS);

const PgSession = connectPgSimple(session);

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS origin blocked: ${origin}`));
    },
    credentials: true,
  }),
);

app.use(
  session({
    store: new PgSession({
      pool,
      tableName: "user_sessions",
      createTableIfMissing: true,
    }),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    proxy: isProduction,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 15 * 60 * 1000,
    },
  }),
);

app.use(passport.initialize());
app.use(passport.session());

app.use(express.json({ limit: "1mb" }));

// Performance middleware - track response times
app.use(performanceMiddleware);

// Request logger middleware
app.use(requestLogger);

// Mark internal operations before rate limiting
app.use(markInternalOperation);

// Apply rate limiters
app.use("/api", generalLimiter);
app.use("/api/auth", authLimiter);

// Feature modules
registerModules(app, apiModules);

// Infra routes (outside /api)
app.use("/health", healthRouter);

// Global error handler - must be after all routes
app.use(errorHandler);

let server: Server | null = null;

async function startServer(): Promise<void> {
  try {
    await checkDatabaseConnection();

    server = app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });
  } catch (error) {
    logger.error("Failed to start server", {
      error: error instanceof Error ? error.message : String(error),
    });

    process.exit(1);
  }
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  logger.warn(`Received ${signal}; shutting down gracefully`);

  const hardTimeout = setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10_000);

  hardTimeout.unref();

  try {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server?.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }

    await pool.end();
    clearTimeout(hardTimeout);
    process.exit(0);
  } catch (error) {
    logger.error("Shutdown failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection", {
    reason: reason instanceof Error ? reason.message : String(reason),
  });
});

void startServer();