import authRouter from "./api/router";
import type { ApiModule } from "../module.types";

export const authModule: ApiModule = {
  key: "auth",
  basePath: "/auth",
  router: authRouter,
};
