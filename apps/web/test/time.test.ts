import { describe, expect, it } from "vitest";
import { fullTime, relativeTime } from "@/app/_lib/time";

describe("relativeTime", () => {
  const now = Date.UTC(2026, 8, 17, 13, 0, 0);
  it("steps through seconds, minutes, hours and days", () => {
    expect(relativeTime(now - 2_000, now)).toBe("just now");
    expect(relativeTime(now - 42_000, now)).toBe("42s ago");
    expect(relativeTime(now - 5 * 60_000, now)).toBe("5m ago");
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe("3h ago");
    expect(relativeTime(now - 2 * 86_400_000, now)).toBe("2d ago");
  });

  it("falls back to the date after a week", () => {
    expect(relativeTime(now - 30 * 86_400_000, now)).toBe("2026-08-18");
  });

  it("fullTime is an unambiguous UTC stamp", () => {
    expect(fullTime(now)).toBe("2026-09-17 13:00:00 UTC");
  });
});
