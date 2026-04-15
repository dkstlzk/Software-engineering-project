import { z } from "zod";

const dateOnlyRegex = /^\d{4}-\d{2}-\d{2}$/;

function isValidDateOnly(value: string): boolean {
  const trimmed = value.trim();

  if (!dateOnlyRegex.test(trimmed)) {
    return false;
  }

  const parsed = new Date(`${trimmed}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  const normalized = parsed.toISOString().slice(0, 10);
  return normalized === trimmed;
}

export const listHolidaysSchema = z
  .object({
    fromDate: z
      .string()
      .trim()
      .optional()
      .refine((value) => !value || isValidDateOnly(value), {
        message: "fromDate must be in YYYY-MM-DD format",
      }),
    toDate: z
      .string()
      .trim()
      .optional()
      .refine((value) => !value || isValidDateOnly(value), {
        message: "toDate must be in YYYY-MM-DD format",
      }),
  })
  .refine(
    (data) => {
      if (!data.fromDate || !data.toDate) {
        return true;
      }

      return data.fromDate <= data.toDate;
    },
    {
      message: "fromDate must be before or equal to toDate",
      path: ["fromDate"],
    },
  );

export const createHolidaySchema = z
  .object({
    name: z.string().trim().min(1, "name is required").max(120, "name is too long"),
    description: z
      .string()
      .trim()
      .max(1000, "description is too long")
      .optional()
      .nullable(),
    startDate: z.string().trim().refine((value) => isValidDateOnly(value), {
      message: "startDate must be in YYYY-MM-DD format",
    }),
    endDate: z.string().trim().refine((value) => isValidDateOnly(value), {
      message: "endDate must be in YYYY-MM-DD format",
    }),
  })
  .refine((data) => data.startDate <= data.endDate, {
    message: "startDate must be before or equal to endDate",
    path: ["startDate"],
  });

const dayOfWeekValues = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;

export const listTimetableDayOverridesSchema = z
  .object({
    fromDate: z
      .string()
      .trim()
      .optional()
      .refine((value) => !value || isValidDateOnly(value), {
        message: "fromDate must be in YYYY-MM-DD format",
      }),
    toDate: z
      .string()
      .trim()
      .optional()
      .refine((value) => !value || isValidDateOnly(value), {
        message: "toDate must be in YYYY-MM-DD format",
      }),
  })
  .refine(
    (data) => {
      if (!data.fromDate || !data.toDate) {
        return true;
      }

      return data.fromDate <= data.toDate;
    },
    {
      message: "fromDate must be before or equal to toDate",
      path: ["fromDate"],
    },
  );

export const upsertTimetableDayOverrideSchema = z.object({
  targetDate: z.string().trim().refine((value) => isValidDateOnly(value), {
    message: "targetDate must be in YYYY-MM-DD format",
  }),
  followsDayOfWeek: z.enum(dayOfWeekValues),
  note: z.string().trim().max(1000, "note is too long").optional().nullable(),
});
