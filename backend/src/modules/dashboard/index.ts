import dashboardRouter from "./api/router";
import type { ApiModule } from "../module.types";

export const dashboardModule: ApiModule = {
  key: "dashboard",
  basePath: "/dashboard",
  router: dashboardRouter,
};
