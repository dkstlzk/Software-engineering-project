import systemSettingsRouter from "./api/router";
import type { ApiModule } from "../module.types";

export const systemSettingsModule: ApiModule = {
  key: "system-settings",
  basePath: "/system-settings",
  router: systemSettingsRouter,
};
