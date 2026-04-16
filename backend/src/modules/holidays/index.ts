import holidaysRouter from "./api/router";
import type { ApiModule } from "../module.types";

export const holidaysModule: ApiModule = {
  key: "holidays",
  basePath: "/holidays",
  router: holidaysRouter,
};
