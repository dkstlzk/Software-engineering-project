import "./config/env"; // load env FIRST

import express from "express";
import buildingsRouter from "./routes/buildings";
import roomsRouter from "./routes/rooms";
import bookingsRouter from "./routes/bookings";
import bookingRequestsRouter from "./routes/bookingRequests";
import availabilityRoutes from './routes/availability';
import authRoutes from "./routes/auth";
import timetableRoutes from "./modules/timetable/routes";


const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());

// routes
app.use("/buildings", buildingsRouter);
app.use("/rooms", roomsRouter);
app.use("/bookings", bookingsRouter);
app.use("/booking-requests", bookingRequestsRouter);
app.use('/availability', availabilityRoutes);
app.use("/auth", authRoutes);
app.use("/timetable", timetableRoutes);
app.use("/api/timetable", timetableRoutes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});