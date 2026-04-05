import "./config/env"; // load env FIRST

import connectPgSimple from "connect-pg-simple";
import express from "express";
import session from "express-session";
import passport from "./auth/passport";
import { env } from "./config/env";
import { pool } from "./db";
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
const PORT = env.PORT || 5000;
const sessionSecret = env.SESSION_SECRET ?? env.JWT_SECRET;

const PgSession = connectPgSimple(session);

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
    cookie: {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 15 * 60 * 1000,
    },
  }),
);

app.use(passport.initialize());
app.use(passport.session());

app.use(express.json());

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

app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});