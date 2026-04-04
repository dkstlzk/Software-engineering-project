import bookingRequestsRouter from "./api/router";
import type { ApiModule } from "../module.types";

export const bookingRequestsModule: ApiModule = {
  key: "bookingRequests",
  basePath: "/booking-requests",
  router: bookingRequestsRouter,
};
