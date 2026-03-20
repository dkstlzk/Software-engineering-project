import { pgTable, serial, text, uniqueIndex, integer } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const buildings = pgTable(
  "buildings",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
  },
  (table) => ({
    nameUnique: uniqueIndex("buildings_name_unique").on(
      sql`lower(${table.name})`
    ),
  })
);

export const rooms = pgTable(
  "rooms",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    buildingId: integer("building_id")
      .notNull()
      .references(() => buildings.id),
  },
  (table) => ({
    roomUniquePerBuilding: uniqueIndex("rooms_building_name_unique").on(
      table.buildingId,
      sql`lower(${table.name})`
    ),
  })
);