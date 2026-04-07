import timetableRouter from "./routes";
import type { ApiModule } from "../module.types";

export const timetableModule: ApiModule = {
  key: "timetable",
  basePath: "/timetable",
  router: timetableRouter,
};
