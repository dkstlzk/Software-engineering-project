import buildingsRouter from "./api/router";
import type { ApiModule } from "../module.types";

export const buildingsModule: ApiModule = {
  key: "buildings",
  basePath: "/buildings",
  router: buildingsRouter,
};
