import { pgTable, pgEnum, serial, text, uniqueIndex, integer,timestamp } from "drizzle-orm/pg-core";
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

export const bookings = pgTable("bookings", {
  id: serial("id").primaryKey(),

  roomId: integer("room_id")
    .notNull()
    .references(() => rooms.id, { onDelete: "cascade" }),

  startAt: timestamp("start_at", { withTimezone: false }).notNull(),

  endAt: timestamp("end_at", { withTimezone: false }).notNull(),

  requestId: integer("request_id").references(() => bookingRequests.id, {
    onDelete: "set null",
  }),
});

export const bookingStatusEnum = pgEnum("booking_status", [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
]);

export const bookingRequests = pgTable("booking_requests", {
  id: serial("id").primaryKey(),

  roomId: integer("room_id")
    .notNull()
    .references(() => rooms.id, { onDelete: "cascade" }),

  startAt: timestamp("start_at").notNull(),
  endAt: timestamp("end_at").notNull(),

  purpose: text("purpose").notNull(),

  status: bookingStatusEnum("status").notNull().default("PENDING"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
});