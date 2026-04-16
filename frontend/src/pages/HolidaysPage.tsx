import { useEffect, useMemo, useState } from "react";
import {
  createHoliday,
  deleteHoliday,
  deleteTimetableDayOverride,
  getHolidays,
  getTimetableDayOverrides,
  saveTimetableDayOverride,
  type DayOfWeek,
  type Holiday,
  type TimetableDayOverride,
} from "../lib/api";
import { formatDateDDMMYYYY } from "../utils/datetime";
import { formatError } from "../utils/formatError";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";

const DAY_OF_WEEK_OPTIONS: DayOfWeek[] = [
  "MON",
  "TUE",
  "WED",
  "THU",
  "FRI",
  "SAT",
  "SUN",
];

const DAY_OF_WEEK_LABELS: Record<DayOfWeek, string> = {
  MON: "Monday",
  TUE: "Tuesday",
  WED: "Wednesday",
  THU: "Thursday",
  FRI: "Friday",
  SAT: "Saturday",
  SUN: "Sunday",
};

export default function HolidaysPage() {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [dayOverrides, setDayOverrides] = useState<TimetableDayOverride[]>([]);

  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [description, setDescription] = useState("");

  const [overrideTargetDate, setOverrideTargetDate] = useState("");
  const [overrideFollowsDay, setOverrideFollowsDay] = useState<DayOfWeek>("MON");
  const [overrideNote, setOverrideNote] = useState("");

  const [holidaysLoading, setHolidaysLoading] = useState(false);
  const [dayOverridesLoading, setDayOverridesLoading] = useState(false);
  const [holidaySubmitting, setHolidaySubmitting] = useState(false);
  const [overrideSubmitting, setOverrideSubmitting] = useState(false);
  const [deletingHolidayId, setDeletingHolidayId] = useState<number | null>(null);
  const [deletingOverrideId, setDeletingOverrideId] = useState<number | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const orderedHolidays = useMemo(
    () =>
      [...holidays].sort((a, b) => {
        if (a.startDate !== b.startDate) {
          return a.startDate.localeCompare(b.startDate);
        }

        return a.id - b.id;
      }),
    [holidays],
  );

  const orderedDayOverrides = useMemo(
    () =>
      [...dayOverrides].sort((a, b) => {
        if (a.targetDate !== b.targetDate) {
          return a.targetDate.localeCompare(b.targetDate);
        }

        return a.id - b.id;
      }),
    [dayOverrides],
  );

  const loadHolidays = async () => {
    setHolidaysLoading(true);

    try {
      const rows = await getHolidays();
      setHolidays(rows);
    } catch (loadError) {
      setError(formatError(loadError, "Failed to load holidays"));
    } finally {
      setHolidaysLoading(false);
    }
  };

  const loadDayOverrides = async () => {
    setDayOverridesLoading(true);

    try {
      const rows = await getTimetableDayOverrides();
      setDayOverrides(rows);
    } catch (loadError) {
      setError(formatError(loadError, "Failed to load day overrides"));
    } finally {
      setDayOverridesLoading(false);
    }
  };

  useEffect(() => {
    setError(null);
    void loadHolidays();
    void loadDayOverrides();
  }, []);

  const handleCreateHoliday = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!name.trim()) {
      setError("Holiday name is required");
      return;
    }

    if (!startDate || !endDate) {
      setError("Start and end dates are required");
      return;
    }

    if (startDate > endDate) {
      setError("Start date must be before or equal to end date");
      return;
    }

    setHolidaySubmitting(true);
    setError(null);
    setInfoMessage(null);

    try {
      const response = await createHoliday({
        name: name.trim(),
        startDate,
        endDate,
        ...(description.trim() ? { description: description.trim() } : {}),
      });

      setName("");
      setStartDate("");
      setEndDate("");
      setDescription("");

      if (response.prunedTimetableBookings > 0) {
        setInfoMessage(
          `Holiday created. ${response.prunedTimetableBookings} timetable allocation booking(s) were pruned.`,
        );
      } else {
        setInfoMessage("Holiday created successfully.");
      }

      await loadHolidays();
    } catch (createError) {
      setError(formatError(createError, "Failed to create holiday"));
    } finally {
      setHolidaySubmitting(false);
    }
  };

  const handleDeleteHoliday = async (holidayId: number) => {
    const shouldDelete = window.confirm("Delete this holiday?");

    if (!shouldDelete) {
      return;
    }

    setDeletingHolidayId(holidayId);
    setError(null);
    setInfoMessage(null);

    try {
      await deleteHoliday(holidayId);
      setInfoMessage("Holiday deleted.");
      await loadHolidays();
    } catch (deleteError) {
      setError(formatError(deleteError, "Failed to delete holiday"));
    } finally {
      setDeletingHolidayId(null);
    }
  };

  const handleSaveDayOverride = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!overrideTargetDate) {
      setError("Target date is required for day override");
      return;
    }

    setOverrideSubmitting(true);
    setError(null);
    setInfoMessage(null);

    try {
      const response = await saveTimetableDayOverride({
        targetDate: overrideTargetDate,
        followsDayOfWeek: overrideFollowsDay,
        ...(overrideNote.trim() ? { note: overrideNote.trim() } : {}),
      });

      setOverrideTargetDate("");
      setOverrideFollowsDay("MON");
      setOverrideNote("");

      setInfoMessage(
        `Day override saved. Recomputed ${response.recompute.processedSlotSystems} of ${response.recompute.impactedSlotSystems} impacted slot system(s), created ${response.recompute.createdBookings} booking(s), and skipped ${response.recompute.skippedOperations} operation(s).`,
      );

      await loadDayOverrides();
    } catch (saveError) {
      setError(formatError(saveError, "Failed to save day override"));
    } finally {
      setOverrideSubmitting(false);
    }
  };

  const handleDeleteDayOverride = async (overrideId: number) => {
    const shouldDelete = window.confirm("Delete this day override?");

    if (!shouldDelete) {
      return;
    }

    setDeletingOverrideId(overrideId);
    setError(null);
    setInfoMessage(null);

    try {
      const response = await deleteTimetableDayOverride(overrideId);

      setInfoMessage(
        `Day override deleted. Recomputed ${response.recompute.processedSlotSystems} of ${response.recompute.impactedSlotSystems} impacted slot system(s).`,
      );

      await loadDayOverrides();
    } catch (deleteError) {
      setError(formatError(deleteError, "Failed to delete day override"));
    } finally {
      setDeletingOverrideId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Day Adjustments</h1>
        <p className="mt-2 text-gray-600">
          Manage holiday periods and single-date day overrides in one place. Day overrides let a date follow a different timetable weekday pattern.
        </p>
      </div>

      {infoMessage && (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-blue-800">
          {infoMessage}
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-800">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Add Holiday</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleCreateHoliday}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-2 md:col-span-3">
                <Label htmlFor="holidayName">Holiday Name</Label>
                <Input
                  id="holidayName"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. Independence Day"
                  disabled={holidaySubmitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="holidayStartDate">Start Date</Label>
                <Input
                  id="holidayStartDate"
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  disabled={holidaySubmitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="holidayEndDate">End Date</Label>
                <Input
                  id="holidayEndDate"
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  disabled={holidaySubmitting}
                />
              </div>
              <div className="space-y-2 md:col-span-3">
                <Label htmlFor="holidayDescription">Description (optional)</Label>
                <Input
                  id="holidayDescription"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Optional details"
                  disabled={holidaySubmitting}
                />
              </div>
            </div>

            <Button type="submit" disabled={holidaySubmitting}>
              {holidaySubmitting ? "Saving..." : "Add Holiday"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add Day Override</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSaveDayOverride}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="overrideTargetDate">Date</Label>
                <Input
                  id="overrideTargetDate"
                  type="date"
                  value={overrideTargetDate}
                  onChange={(event) => setOverrideTargetDate(event.target.value)}
                  disabled={overrideSubmitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="overrideFollowsDay">Follows Timetable Day</Label>
                <select
                  id="overrideFollowsDay"
                  value={overrideFollowsDay}
                  onChange={(event) =>
                    setOverrideFollowsDay(event.target.value as DayOfWeek)
                  }
                  disabled={overrideSubmitting}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
                >
                  {DAY_OF_WEEK_OPTIONS.map((dayOfWeek) => (
                    <option key={dayOfWeek} value={dayOfWeek}>
                      {DAY_OF_WEEK_LABELS[dayOfWeek]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2 md:col-span-3">
                <Label htmlFor="overrideNote">Note (optional)</Label>
                <Textarea
                  id="overrideNote"
                  value={overrideNote}
                  onChange={(event) => setOverrideNote(event.target.value)}
                  placeholder="Reason for this adjustment"
                  disabled={overrideSubmitting}
                />
              </div>
            </div>

            <p className="text-sm text-gray-600">
              Saving an existing date updates it. Each date can have only one day override.
            </p>

            <Button type="submit" disabled={overrideSubmitting}>
              {overrideSubmitting ? "Saving..." : "Save Day Override"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Configured Holidays</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {holidaysLoading && <p className="text-sm text-gray-600">Loading holidays...</p>}

            {!holidaysLoading && orderedHolidays.length === 0 && (
              <p className="text-sm text-gray-600">No holidays configured.</p>
            )}

            {!holidaysLoading &&
              orderedHolidays.map((holiday) => (
                <div
                  key={holiday.id}
                  className="flex flex-col gap-3 rounded-md border border-gray-200 px-4 py-3 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="font-medium text-gray-900">{holiday.name}</p>
                    <p className="text-sm text-gray-600">
                      {formatDateDDMMYYYY(holiday.startDate)} - {formatDateDDMMYYYY(holiday.endDate)}
                    </p>
                    {holiday.description && (
                      <p className="mt-1 text-sm text-gray-600">{holiday.description}</p>
                    )}
                  </div>

                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={deletingHolidayId === holiday.id}
                    onClick={() => void handleDeleteHoliday(holiday.id)}
                  >
                    {deletingHolidayId === holiday.id ? "Deleting..." : "Delete"}
                  </Button>
                </div>
              ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Configured Day Overrides</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {dayOverridesLoading && (
              <p className="text-sm text-gray-600">Loading day overrides...</p>
            )}

            {!dayOverridesLoading && orderedDayOverrides.length === 0 && (
              <p className="text-sm text-gray-600">No day overrides configured.</p>
            )}

            {!dayOverridesLoading &&
              orderedDayOverrides.map((dayOverride) => (
                <div
                  key={dayOverride.id}
                  className="flex flex-col gap-3 rounded-md border border-gray-200 px-4 py-3 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="font-medium text-gray-900">
                      {formatDateDDMMYYYY(dayOverride.targetDate)} follows {DAY_OF_WEEK_LABELS[dayOverride.followsDayOfWeek]}
                    </p>
                    <p className="text-sm text-gray-600">
                      Effective timetable day: {DAY_OF_WEEK_LABELS[dayOverride.followsDayOfWeek]}
                    </p>
                    {dayOverride.note && (
                      <p className="mt-1 text-sm text-gray-600">{dayOverride.note}</p>
                    )}
                  </div>

                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={deletingOverrideId === dayOverride.id}
                    onClick={() => void handleDeleteDayOverride(dayOverride.id)}
                  >
                    {deletingOverrideId === dayOverride.id ? "Deleting..." : "Delete"}
                  </Button>
                </div>
              ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
