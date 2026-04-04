import roomsRouter from "./api/router";
import type { ApiModule } from "../module.types";

export const roomsModule: ApiModule = {
  key: "rooms",
  basePath: "/rooms",
  router: roomsRouter,
};
