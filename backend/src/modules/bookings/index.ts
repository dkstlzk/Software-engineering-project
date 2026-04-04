import bookingsRouter from "./api/router";
import type { ApiModule } from "../module.types";

export const bookingsModule: ApiModule = {
  key: "bookings",
  basePath: "/bookings",
  router: bookingsRouter,
};
