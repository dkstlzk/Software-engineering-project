import DatePicker from "react-datepicker";
import { enGB } from "date-fns/locale";

type DateInputMode = "date" | "datetime" | "time";

type DateInputProps = {
  id?: string;
  value: string;
  onChange: (nextValue: string) => void;
  mode: DateInputMode;
  disabled?: boolean;
  className?: string;
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function fromInputValue(value: string, mode: DateInputMode): Date | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (mode === "date") {
    const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      return null;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const parsed = new Date(year, month - 1, day, 0, 0, 0, 0);

    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (mode === "time") {
    const match = trimmed.match(/^(\d{2}):(\d{2})$/);
    if (!match) {
      return null;
    }

    const hour = Number(match[1]);
    const minute = Number(match[2]);
    const parsed = new Date(2000, 0, 1, hour, minute, 0, 0);

    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const parsed = new Date(year, month - 1, day, hour, minute, 0, 0);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toInputValue(date: Date, mode: DateInputMode): string {
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());

  if (mode === "date") {
    return `${year}-${month}-${day}`;
  }

  const hour = pad2(date.getHours());
  const minute = pad2(date.getMinutes());

  if (mode === "time") {
    return `${hour}:${minute}`;
  }

  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export function DateInput({
  id,
  value,
  onChange,
  mode,
  disabled,
  className,
}: DateInputProps) {
  return (
    <DatePicker
      id={id}
      selected={fromInputValue(value, mode)}
      onChange={(next: Date | null) => {
        if (!next || Number.isNaN(next.getTime())) {
          onChange("");
          return;
        }

        onChange(toInputValue(next, mode));
      }}
      showTimeSelect={mode === "datetime" || mode === "time"}
      showTimeSelectOnly={mode === "time"}
      timeFormat="HH:mm"
      timeIntervals={1}
      dateFormat={
        mode === "datetime"
          ? "dd/MM/yyyy HH:mm"
          : mode === "time"
            ? "HH:mm"
            : "dd/MM/yyyy"
      }
      locale={enGB}
      className={className ? `input ${className}` : "input"}
      disabled={disabled}
      placeholderText={
        mode === "datetime"
          ? "dd/mm/yyyy hh:mm"
          : mode === "time"
            ? "hh:mm"
            : "dd/mm/yyyy"
      }
      autoComplete="off"
    />
  );
}
