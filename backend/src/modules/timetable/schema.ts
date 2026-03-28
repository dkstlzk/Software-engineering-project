import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  time,
  pgEnum,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const DAY_OF_WEEK_VALUES = [
  "MON",
  "TUE",
  "WED",
  "THU",
  "FRI",
  "SAT",
  "SUN",
] as const;

export const slotSystems = pgTable("slot_systems", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const dayOfWeekEnum = pgEnum("day_of_week", DAY_OF_WEEK_VALUES);

export const slotDays = pgTable(
  "slot_days",
  {
    id: serial("id").primaryKey(),
    slotSystemId: integer("slot_system_id")
      .notNull()
      .references(() => slotSystems.id, { onDelete: "cascade" }),

    dayOfWeek: dayOfWeekEnum("day_of_week").notNull(),
    orderIndex: integer("order_index").notNull(),
    laneCount: integer("lane_count").notNull().default(1),
  },
  (table) => ({
    uniqueDayPerSystem: uniqueIndex("unique_day_per_system").on(
      table.slotSystemId,
      table.dayOfWeek
    ),
    uniqueDayOrderPerSystem: uniqueIndex("unique_day_order_per_system").on(
      table.slotSystemId,
      table.orderIndex
    ),
  })
);

export const slotTimeBands = pgTable(
  "slot_time_bands",
  {
    id: serial("id").primaryKey(),
    slotSystemId: integer("slot_system_id")
      .notNull()
      .references(() => slotSystems.id, { onDelete: "cascade" }),

    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),

    orderIndex: integer("order_index").notNull(),
  },
  (table) => ({
    uniqueOrderPerSystem: uniqueIndex("unique_band_order").on(
      table.slotSystemId,
      table.orderIndex
    ),
  })
);

export const slotBlocks = pgTable("slot_blocks", {
  id: serial("id").primaryKey(),

  slotSystemId: integer("slot_system_id")
    .notNull()
    .references(() => slotSystems.id, { onDelete: "cascade" }),

  dayId: integer("day_id")
    .notNull()
    .references(() => slotDays.id, { onDelete: "cascade" }),

  startBandId: integer("start_band_id")
    .notNull()
    .references(() => slotTimeBands.id, { onDelete: "cascade" }),

  laneIndex: integer("lane_index").notNull().default(0),

  rowSpan: integer("row_span").notNull().default(1),

  label: text("label").notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});