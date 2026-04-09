function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeText(value: string): string | null {
  const trimmed = value.trim();

  if (!trimmed || trimmed === "[object Object]") {
    return null;
  }

  return trimmed;
}

function extractFromUnknown(value: unknown): string | null {
  if (typeof value === "string") {
    return normalizeText(value);
  }

  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }

  if (value instanceof Error) {
    return extractFromUnknown(value.message);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const extracted = extractFromUnknown(item);
      if (extracted) {
        return extracted;
      }
    }
    return null;
  }

  if (isRecord(value)) {
    const candidateKeys = ["error", "message", "detail", "details", "reason", "title"];

    for (const key of candidateKeys) {
      if (key in value) {
        const extracted = extractFromUnknown(value[key]);
        if (extracted) {
          return extracted;
        }
      }
    }

    try {
      const serialized = JSON.stringify(value);
      return normalizeText(serialized);
    } catch {
      return null;
    }
  }

  return null;
}

export function formatError(error: unknown, fallback = "Something went wrong. Please try again."): string {
  return extractFromUnknown(error) ?? fallback;
}
