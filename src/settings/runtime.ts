export interface RuntimeSettings {
  delayHours: number;
  quietEnabled: boolean;
  /** HH:mm — start of quiet window (no NPS). May wrap past midnight. */
  quietStart: string;
  /** HH:mm — end of quiet window; send resumes at this time. */
  quietEnd: string;
  timezone: string;
}

export const DEFAULT_RUNTIME_SETTINGS: RuntimeSettings = {
  delayHours: 2,
  quietEnabled: true,
  quietStart: "00:00",
  quietEnd: "09:00",
  timezone: "Europe/Kyiv",
};

export function parseTimeToMinutes(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) throw new Error(`Invalid time: ${value}`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error(`Invalid time: ${value}`);
  }
  return hours * 60 + minutes;
}

export function formatMinutes(total: number): string {
  const hours = Math.floor(total / 60) % 24;
  const minutes = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** Local wall-clock parts in a timezone. */
export function getZonedParts(date: Date, timeZone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: string;
} {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: parts.weekday ?? "",
  };
}

/** Convert a local Y-M-D H:M in timezone to UTC epoch ms. */
export function zonedLocalToUtcMs(
  parts: { year: number; month: number; day: number; hour: number; minute: number },
  timeZone: string,
): number {
  // Binary search UTC that formats back to the desired local time.
  let guess = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
  for (let i = 0; i < 4; i += 1) {
    const got = getZonedParts(new Date(guess), timeZone);
    const gotAsUtc = Date.UTC(got.year, got.month - 1, got.day, got.hour, got.minute, 0);
    const wantAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
    guess += wantAsUtc - gotAsUtc;
  }
  return guess;
}

export function addCalendarDays(
  parts: { year: number; month: number; day: number },
  days: number,
): { year: number; month: number; day: number } {
  const dt = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    year: dt.getUTCFullYear(),
    month: dt.getUTCMonth() + 1,
    day: dt.getUTCDate(),
  };
}

export function isInQuietWindow(
  date: Date,
  settings: Pick<RuntimeSettings, "quietEnabled" | "quietStart" | "quietEnd" | "timezone">,
): boolean {
  if (!settings.quietEnabled) return false;
  const parts = getZonedParts(date, settings.timezone);
  const minutes = parts.hour * 60 + parts.minute;
  const start = parseTimeToMinutes(settings.quietStart);
  const end = parseTimeToMinutes(settings.quietEnd);

  if (start === end) return false; // disabled degenerate window
  if (start < end) {
    return minutes >= start && minutes < end;
  }
  // Overnight window, e.g. 22:00 → 09:00
  return minutes >= start || minutes < end;
}

/**
 * If candidate send time falls into quiet hours, push it to quietEnd
 * (same morning or next morning for overnight windows).
 */
export function adjustRunAtForQuietHours(
  candidateRunAtMs: number,
  settings: RuntimeSettings,
): { runAt: number; deferred: boolean } {
  if (!settings.quietEnabled) {
    return { runAt: candidateRunAtMs, deferred: false };
  }
  if (!isInQuietWindow(new Date(candidateRunAtMs), settings)) {
    return { runAt: candidateRunAtMs, deferred: false };
  }

  const parts = getZonedParts(new Date(candidateRunAtMs), settings.timezone);
  const start = parseTimeToMinutes(settings.quietStart);
  const end = parseTimeToMinutes(settings.quietEnd);
  const endHour = Math.floor(end / 60);
  const endMinute = end % 60;

  let day = { year: parts.year, month: parts.month, day: parts.day };
  const minutes = parts.hour * 60 + parts.minute;

  if (start < end) {
    // Same-day window: 00:00–09:00 → resume today at quietEnd
    // (candidate already inside [start, end))
  } else {
    // Overnight: if we are after start (e.g. 23:30), resume next calendar day at quietEnd.
    // If we are before end (e.g. 01:00), resume same calendar day at quietEnd.
    if (minutes >= start) {
      day = addCalendarDays(day, 1);
    }
  }

  const runAt = zonedLocalToUtcMs(
    {
      year: day.year,
      month: day.month,
      day: day.day,
      hour: endHour,
      minute: endMinute,
    },
    settings.timezone,
  );

  return { runAt, deferred: true };
}

export function computeRunAt(nowMs: number, settings: RuntimeSettings): {
  runAt: number;
  delayMs: number;
  deferred: boolean;
} {
  const delayMs = Math.max(0, Math.round(settings.delayHours * 60 * 60 * 1000));
  const candidate = nowMs + delayMs;
  const adjusted = adjustRunAtForQuietHours(candidate, settings);
  return { runAt: adjusted.runAt, delayMs, deferred: adjusted.deferred };
}

export function validateRuntimeSettings(input: Partial<RuntimeSettings>): RuntimeSettings {
  const delayHours = Number(input.delayHours ?? DEFAULT_RUNTIME_SETTINGS.delayHours);
  if (!Number.isFinite(delayHours) || delayHours < 0 || delayHours > 168) {
    throw new Error("Затримка має бути від 0 до 168 годин");
  }

  const quietStart = String(input.quietStart ?? DEFAULT_RUNTIME_SETTINGS.quietStart);
  const quietEnd = String(input.quietEnd ?? DEFAULT_RUNTIME_SETTINGS.quietEnd);
  parseTimeToMinutes(quietStart);
  parseTimeToMinutes(quietEnd);

  return {
    delayHours,
    quietEnabled: Boolean(input.quietEnabled),
    quietStart,
    quietEnd,
    timezone: String(input.timezone ?? DEFAULT_RUNTIME_SETTINGS.timezone).trim() || "Europe/Kyiv",
  };
}
