import "./config/env"; // load env FIRST

import connectPgSimple from "connect-pg-simple";
import express from "express";
import session from "express-session";
import passport from "./auth/passport";
import { env } from "./config/env";
import { pool } from "./db";
import buildingsRouter from "./routes/buildings";
import roomsRouter from "./routes/rooms";
import bookingsRouter from "./routes/bookings";
import bookingRequestsRouter from "./routes/bookingRequests";
import availabilityRoutes from './routes/availability';
import authRoutes from "./routes/auth";
import usersRoutes from "./routes/users";
import timetableRoutes from "./modules/timetable/routes";


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

// routes
app.use("/buildings", buildingsRouter);
app.use("/rooms", roomsRouter);
app.use("/bookings", bookingsRouter);
app.use("/booking-requests", bookingRequestsRouter);
app.use('/availability', availabilityRoutes);
app.use("/auth", authRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/timetable", timetableRoutes);
app.use("/api/timetable", timetableRoutes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});