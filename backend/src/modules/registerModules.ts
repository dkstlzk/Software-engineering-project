import type { Express } from "express";
import type { ApiModule } from "./module.types";
import logger from "../shared/utils/logger";

export function registerModules(app: Express, modules: ApiModule[]): void {
  const mountedPaths = new Set<string>();

  for (const moduleDef of modules) {
    if (mountedPaths.has(moduleDef.basePath)) {
      throw new Error(`Duplicate module mount path detected: ${moduleDef.basePath}`);
    }

    mountedPaths.add(moduleDef.basePath);
    app.use(`/api${moduleDef.basePath}`, moduleDef.router);
    logger.info(`Mounted module ${moduleDef.key} at /api${moduleDef.basePath}`);
  }
}
