import { Router } from "express";
import { eq } from "drizzle-orm";
import { authMiddleware } from "../../../middleware/auth";
import { requireRole } from "../../../middleware/rbac";
import { db } from "../../../db";
import { systemPreferences } from "../../../db/schema";
import logger from "../../../shared/utils/logger";

const AUTO_LOAD_SECTION_KEYS = [
  "dashboard",
  "bookings",
  "rooms",
  "availability",
  "bookingRequests",
  "users",
] as const;

type AutoLoadSectionKey = (typeof AUTO_LOAD_SECTION_KEYS)[number];

type AutoLoadSections = Record<AutoLoadSectionKey, boolean>;

const DEFAULT_AUTO_LOAD_SECTIONS: AutoLoadSections = {
  dashboard: false,
  bookings: false,
  rooms: false,
  availability: false,
  bookingRequests: false,
  users: false,
};

type SystemPreferencesPayload = {
  manualDataLoading: boolean;
  autoLoadDependentData: boolean;
  autoLoadSections: AutoLoadSections;
  updatedBy: number | null;
  updatedAt: Date;
};

const SINGLETON_ID = 1;
const router = Router();

function hasOwnProperty(record: unknown, key: string): boolean {
  if (!record || typeof record !== "object") {
    return false;
  }

  return Object.prototype.hasOwnProperty.call(record, key);
}

function normalizeAutoLoadSections(value: unknown): AutoLoadSections {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_AUTO_LOAD_SECTIONS };
  }

  const record = value as Record<string, unknown>;
  const next = { ...DEFAULT_AUTO_LOAD_SECTIONS };

  for (const key of AUTO_LOAD_SECTION_KEYS) {
    if (typeof record[key] === "boolean") {
      next[key] = record[key] as boolean;
    }
  }

  return next;
}

function parseAutoLoadSectionsPatch(
  value: unknown,
): Partial<AutoLoadSections> | "invalid" {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "invalid";
  }

  const record = value as Record<string, unknown>;
  const patch: Partial<AutoLoadSections> = {};

  for (const [key, raw] of Object.entries(record)) {
    if (!AUTO_LOAD_SECTION_KEYS.includes(key as AutoLoadSectionKey)) {
      return "invalid";
    }

    if (typeof raw !== "boolean") {
      return "invalid";
    }

    patch[key as AutoLoadSectionKey] = raw;
  }

  return patch;
}

async function readSystemPreferences(): Promise<SystemPreferencesPayload> {
  const [existing] = await db
    .select({
      manualDataLoading: systemPreferences.manualDataLoading,
      autoLoadDependentData: systemPreferences.autoLoadDependentData,
      autoLoadSections: systemPreferences.autoLoadSections,
      updatedBy: systemPreferences.updatedBy,
      updatedAt: systemPreferences.updatedAt,
    })
    .from(systemPreferences)
    .where(eq(systemPreferences.id, SINGLETON_ID))
    .limit(1);

  if (existing) {
    return {
      ...existing,
      autoLoadSections: normalizeAutoLoadSections(existing.autoLoadSections),
    };
  }

  await db
    .insert(systemPreferences)
    .values({
      id: SINGLETON_ID,
      manualDataLoading: true,
      autoLoadDependentData: false,
      autoLoadSections: DEFAULT_AUTO_LOAD_SECTIONS,
    })
    .onConflictDoNothing();

  const [created] = await db
    .select({
      manualDataLoading: systemPreferences.manualDataLoading,
      autoLoadDependentData: systemPreferences.autoLoadDependentData,
      autoLoadSections: systemPreferences.autoLoadSections,
      updatedBy: systemPreferences.updatedBy,
      updatedAt: systemPreferences.updatedAt,
    })
    .from(systemPreferences)
    .where(eq(systemPreferences.id, SINGLETON_ID))
    .limit(1);

  if (!created) {
    throw new Error("Failed to initialize system preferences");
  }

  return {
    ...created,
    autoLoadSections: normalizeAutoLoadSections(created.autoLoadSections),
  };
}

router.get("/", authMiddleware, async (_req, res) => {
  try {
    const preferences = await readSystemPreferences();
    return res.json(preferences);
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ message: "Failed to fetch system preferences" });
  }
});

router.put("/", authMiddleware, requireRole("ADMIN"), async (req, res) => {
  try {
    const rawBody = req.body as Record<string, unknown> | null | undefined;

    const hasManualDataLoading = hasOwnProperty(rawBody, "manualDataLoading");
    const hasAutoLoadDependentData = hasOwnProperty(rawBody, "autoLoadDependentData");
    const hasAutoLoadSections = hasOwnProperty(rawBody, "autoLoadSections");

    if (!hasManualDataLoading && !hasAutoLoadDependentData && !hasAutoLoadSections) {
      return res.status(400).json({
        message:
          "At least one property must be provided: manualDataLoading, autoLoadDependentData, or autoLoadSections",
      });
    }

    if (
      hasManualDataLoading &&
      typeof rawBody?.manualDataLoading !== "boolean"
    ) {
      return res
        .status(400)
        .json({ message: "manualDataLoading must be a boolean" });
    }

    if (
      hasAutoLoadDependentData &&
      typeof rawBody?.autoLoadDependentData !== "boolean"
    ) {
      return res
        .status(400)
        .json({ message: "autoLoadDependentData must be a boolean" });
    }

    const autoLoadSectionsPatch = hasAutoLoadSections
      ? parseAutoLoadSectionsPatch(rawBody?.autoLoadSections)
      : {};

    if (autoLoadSectionsPatch === "invalid") {
      return res.status(400).json({
        message:
          "autoLoadSections must be an object with section keys and boolean values",
      });
    }

    const current = await readSystemPreferences();

    const nextManualDataLoading = hasManualDataLoading
      ? Boolean(rawBody?.manualDataLoading)
      : current.manualDataLoading;

    const nextAutoLoadDependentData = hasAutoLoadDependentData
      ? Boolean(rawBody?.autoLoadDependentData)
      : current.autoLoadDependentData;

    const nextAutoLoadSections = {
      ...current.autoLoadSections,
      ...autoLoadSectionsPatch,
    };

    const [updated] = await db
      .update(systemPreferences)
      .set({
        manualDataLoading: nextManualDataLoading,
        autoLoadDependentData: nextAutoLoadDependentData,
        autoLoadSections: nextAutoLoadSections,
        updatedBy: req.user?.id ?? null,
        updatedAt: new Date(),
      })
      .where(eq(systemPreferences.id, SINGLETON_ID))
      .returning({
        manualDataLoading: systemPreferences.manualDataLoading,
        autoLoadDependentData: systemPreferences.autoLoadDependentData,
        autoLoadSections: systemPreferences.autoLoadSections,
        updatedBy: systemPreferences.updatedBy,
        updatedAt: systemPreferences.updatedAt,
      });

    if (!updated) {
      return res.status(500).json({ message: "Failed to update system preferences" });
    }

    return res.json({
      ...updated,
      autoLoadSections: normalizeAutoLoadSections(updated.autoLoadSections),
    });
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ message: "Failed to update system preferences" });
  }
});

export default router;
