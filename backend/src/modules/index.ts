import type { ApiModule } from "./module.types";
import { authModule } from "./auth";
import { availabilityModule } from "./availability";
import { bookingRequestsModule } from "./bookingRequests";
import { bookingEditRequestsModule } from "./bookingEditRequests";
import { bookingsModule } from "./bookings";
import { buildingsModule } from "./buildings";
import { holidaysModule } from "./holidays";
import { dashboardModule } from "./dashboard";
import { notificationsModule } from "./notifications";
import { roomsModule } from "./rooms";
import { timetableModule } from "./timetable";
import { usersModule } from "./users";

/**
 * Central feature-module registry.
 * Order is explicit and stable to keep runtime wiring deterministic.
 */
export const apiModules: ApiModule[] = [
  authModule,
  buildingsModule,
  holidaysModule,
  roomsModule,
  bookingsModule,
  bookingRequestsModule,
  bookingEditRequestsModule,
  availabilityModule,
  usersModule,
  notificationsModule,
  timetableModule,
  dashboardModule,
];
