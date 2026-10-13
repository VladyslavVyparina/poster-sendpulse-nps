import { describe, expect, it } from "vitest";
import {
  isCancelStatus,
  isTriggerStatus,
  normalizeStatus,
} from "../src/poster/statuses.js";

describe("status normalization", () => {
  it("maps Ukrainian, English and Polish labels", () => {
    expect(normalizeStatus("Доставлено")).toBe("delivered");
    expect(normalizeStatus("Завершено")).toBe("completed");
    expect(normalizeStatus("Скасовано")).toBe("cancelled");
    expect(normalizeStatus("Повернено")).toBe("returned");
    expect(normalizeStatus("В обробці")).toBe("processing");
    expect(normalizeStatus("Dostarczono")).toBe("delivered");
    expect(normalizeStatus("Zakończono")).toBe("completed");
    expect(normalizeStatus("Otrzymano")).toBe("delivered");
    expect(normalizeStatus("Odebrano")).toBe("completed");
  });

  it("maps numeric codes", () => {
    expect(normalizeStatus(10)).toBe("delivered");
    expect(normalizeStatus(2)).toBe("completed");
    expect(normalizeStatus(7)).toBe("cancelled");
  });

  it("detects trigger and cancel lists", () => {
    const triggers = ["delivered", "completed", "доставлено", "завершено"];
    const cancels = ["cancelled", "returned", "скасовано"];

    expect(isTriggerStatus("Доставлено", triggers)).toBe(true);
    expect(isTriggerStatus("Новий", triggers)).toBe(false);
    expect(isCancelStatus("Повернено", cancels)).toBe(true);
    expect(isCancelStatus("Завершено", cancels)).toBe(false);
  });
});
