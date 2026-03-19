import { pgTable, serial, text } from "drizzle-orm/pg-core";

export const buildings = pgTable("buildings", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
});