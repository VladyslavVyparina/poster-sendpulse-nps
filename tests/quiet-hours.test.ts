import { describe, expect, it } from "vitest";
import {
  adjustRunAtForQuietHours,
  computeRunAt,
  getZonedParts,
  isInQuietWindow,
} from "../src/settings/runtime.js";

const settings = {
  delayHours: 2,
  quietEnabled: true,
  quietStart: "00:00",
  quietEnd: "09:00",
  timezone: "Europe/Kyiv",
};

describe("quiet hours", () => {
  it("detects night window after midnight", () => {
    // 2026-08-04 01:00 Europe/Kyiv = 2026-08-03 22:00 UTC (EEST = UTC+3)
    const night = new Date("2026-08-03T22:00:00.000Z");
    expect(isInQuietWindow(night, settings)).toBe(true);

    const morning = new Date("2026-08-04T07:00:00.000Z"); // 10:00 Kyiv
    expect(isInQuietWindow(morning, settings)).toBe(false);
  });

  it("defers 01:00 send to 09:00 same morning", () => {
    const candidate = new Date("2026-08-03T22:00:00.000Z").getTime(); // 01:00 Kyiv
    const { runAt, deferred } = adjustRunAtForQuietHours(candidate, settings);
    expect(deferred).toBe(true);
    const parts = getZonedParts(new Date(runAt), "Europe/Kyiv");
    expect(parts.hour).toBe(9);
    expect(parts.minute).toBe(0);
    expect(parts.day).toBe(4);
  });

  it("keeps daytime schedule unchanged", () => {
    const candidate = new Date("2026-08-04T12:00:00.000Z").getTime(); // 15:00 Kyiv
    const { runAt, deferred } = adjustRunAtForQuietHours(candidate, settings);
    expect(deferred).toBe(false);
    expect(runAt).toBe(candidate);
  });

  it("order at 23:00 + 2h defers past midnight to morning", () => {
    // 23:00 Kyiv = 20:00 UTC
    const now = new Date("2026-08-03T20:00:00.000Z").getTime();
    const result = computeRunAt(now, settings);
    expect(result.deferred).toBe(true);
    const parts = getZonedParts(new Date(result.runAt), "Europe/Kyiv");
    expect(parts.hour).toBe(9);
    expect(parts.day).toBe(4);
  });

  it("supports overnight quiet window 22:00-09:00", () => {
    const overnight = {
      ...settings,
      quietStart: "22:00",
      quietEnd: "09:00",
    };
    const at2300 = new Date("2026-08-03T20:00:00.000Z"); // 23:00 Kyiv
    expect(isInQuietWindow(at2300, overnight)).toBe(true);
    const adjusted = adjustRunAtForQuietHours(at2300.getTime(), overnight);
    const parts = getZonedParts(new Date(adjusted.runAt), "Europe/Kyiv");
    expect(parts.hour).toBe(9);
    expect(parts.day).toBe(4);
  });
});
