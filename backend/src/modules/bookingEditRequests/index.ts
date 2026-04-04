import bookingEditRequestsRouter from "./api/router";
import type { ApiModule } from "../module.types";

export const bookingEditRequestsModule: ApiModule = {
  key: "bookingEditRequests",
  basePath: "/booking-edit-requests",
  router: bookingEditRequestsRouter,
};
