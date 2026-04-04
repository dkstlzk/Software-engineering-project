import availabilityRouter from "./api/router";
import type { ApiModule } from "../module.types";

export const availabilityModule: ApiModule = {
  key: "availability",
  basePath: "/availability",
  router: availabilityRouter,
};
