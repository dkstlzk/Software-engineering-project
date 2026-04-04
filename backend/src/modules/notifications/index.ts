import notificationsRouter from "./api/router";
import type { ApiModule } from "../module.types";

export const notificationsModule: ApiModule = {
  key: "notifications",
  basePath: "/notifications",
  router: notificationsRouter,
};
