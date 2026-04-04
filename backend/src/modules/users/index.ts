import usersRouter from "./api/router";
import type { ApiModule } from "../module.types";

export const usersModule: ApiModule = {
  key: "users",
  basePath: "/users",
  router: usersRouter,
};
