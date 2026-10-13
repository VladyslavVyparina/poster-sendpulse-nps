import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JobStore } from "../src/db/database.js";
import { buildPosterVerify } from "../src/poster/webhook.js";
import { NpsFlowService } from "../src/services/nps-flow.js";
import type { RuntimeSettings } from "../src/settings/runtime.js";
import type { OrderSnapshot, PosterWebhookPayload } from "../src/types.js";

function tempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nps-"));
  return path.join(dir, "test.sqlite");
}

function signedPayload(
  partial: Omit<PosterWebhookPayload, "verify">,
  secret = "app-secret",
): PosterWebhookPayload {
  return {
    ...partial,
    verify: buildPosterVerify(partial, secret),
  };
}

describe("NpsFlowService", () => {
  const stores: JobStore[] = [];

  afterEach(() => {
    while (stores.length) {
      stores.pop()?.close();
    }
  });

  function setup(options?: {
    delayHours?: number;
    now?: number;
    settings?: Partial<RuntimeSettings>;
  }) {
    const store = new JobStore(tempDb());
    stores.push(store);

    const sendNps = vi.fn(async () => ({ ok: true as const, mode: "dry-run" }));
    const resolveOrderSnapshot = vi.fn();
    const runtime: RuntimeSettings = {
      delayHours: options?.delayHours ?? 2,
      quietEnabled: false,
      quietStart: "00:00",
      quietEnd: "09:00",
      timezone: "Europe/Kyiv",
      ...options?.settings,
    };
    let nowMs = options?.now ?? 1_000_000;

    const flow = new NpsFlowService(
      store,
      { resolveOrderSnapshot, getClient: vi.fn(), getIncomingOrder: vi.fn(), getTransaction: vi.fn() },
      { sendNps },
      {
        now: () => nowMs,
        getSettings: () => runtime,
        triggerStatuses: ["delivered", "completed", "доставлено", "завершено"],
        cancelStatuses: ["cancelled", "returned", "скасовано", "повернено"],
        posterSecret: "app-secret",
        posterAccount: undefined,
      },
    );

    return {
      store,
      flow,
      sendNps,
      resolveOrderSnapshot,
      runtime,
      setNow: (value: number) => {
        nowMs = value;
      },
    };
  }

  it("schedules NPS only for delivered/completed", async () => {
    const { store, flow } = setup({ delayHours: 2 });

    const snapshot: OrderSnapshot = {
      orderId: "55",
      objectType: "incoming_order",
      statusRaw: "Доставлено",
      statusNormalized: "delivered",
      phone: "+380501112233",
      account: "demo",
    };

    const result = await flow.handleWebhook(
      signedPayload({
        account: "demo",
        object: "incoming_order",
        object_id: "55",
        action: "changed",
        time: 123,
        data: { snapshot },
      }),
    );

    expect(result.action).toBe("scheduled");
    expect(store.listJobs()).toHaveLength(1);
    expect(store.listJobs()[0].run_at).toBe(1_000_000 + 2 * 60 * 60 * 1000);
  });

  it("ignores non-trigger statuses", async () => {
    const { store, flow } = setup();
    const result = await flow.handleWebhook(
      signedPayload({
        account: "demo",
        object: "incoming_order",
        object_id: "55",
        action: "changed",
        time: 123,
        data: {
          snapshot: {
            orderId: "55",
            objectType: "incoming_order",
            statusRaw: "В обробці",
            statusNormalized: "processing",
            phone: "+380501112233",
            account: "demo",
          },
        },
      }),
    );

    expect(result.action).toBe("status_not_trigger");
    expect(store.listJobs()).toHaveLength(0);
  });

  it("cancels pending job when order becomes returned", async () => {
    const { store, flow } = setup();

    await flow.handleWebhook(
      signedPayload({
        account: "demo",
        object: "incoming_order",
        object_id: "77",
        action: "changed",
        time: 123,
        data: {
          snapshot: {
            orderId: "77",
            objectType: "incoming_order",
            statusRaw: "Завершено",
            statusNormalized: "completed",
            phone: "+380501112233",
            account: "demo",
          },
        },
      }),
    );

    const cancelResult = await flow.handleWebhook(
      signedPayload({
        account: "demo",
        object: "incoming_order",
        object_id: "77",
        action: "changed",
        time: 124,
        data: {
          snapshot: {
            orderId: "77",
            objectType: "incoming_order",
            statusRaw: "Повернено",
            statusNormalized: "returned",
            phone: "+380501112233",
            account: "demo",
          },
        },
      }),
    );

    expect(cancelResult.action).toBe("cancelled_pending");
    expect(store.listJobs()[0].job_status).toBe("cancelled");
  });

  it("sends due jobs through SendPulse client", async () => {
    const { store, flow, sendNps, resolveOrderSnapshot, setNow } = setup({
      delayHours: 1,
      now: 1_000_000,
    });
    resolveOrderSnapshot.mockResolvedValue(null);

    await flow.handleWebhook(
      signedPayload({
        account: "demo",
        object: "incoming_order",
        object_id: "88",
        action: "changed",
        time: 123,
        data: {
          snapshot: {
            orderId: "88",
            objectType: "incoming_order",
            statusRaw: "delivered",
            statusNormalized: "delivered",
            phone: "+380501112233",
            firstName: "Іра",
            account: "demo",
          },
        },
      }),
    );

    setNow(store.listJobs()[0].run_at + 1);
    const processed = await flow.processDueJobs();
    expect(processed.sent).toBe(1);
    expect(sendNps).toHaveBeenCalledOnce();
    expect(store.listJobs()[0].job_status).toBe("sent");
  });

  it("does not send if cancelled before due processing", async () => {
    const { store, flow, sendNps, resolveOrderSnapshot } = setup({ delayHours: 1 });
    resolveOrderSnapshot.mockResolvedValue({
      orderId: "99",
      objectType: "incoming_order",
      statusRaw: "скасовано",
      statusNormalized: "cancelled",
      phone: "+380501112233",
      account: "demo",
    });

    await flow.handleWebhook(
      signedPayload({
        account: "demo",
        object: "incoming_order",
        object_id: "99",
        action: "changed",
        time: 123,
        data: {
          snapshot: {
            orderId: "99",
            objectType: "incoming_order",
            statusRaw: "delivered",
            statusNormalized: "delivered",
            phone: "+380501112233",
            account: "demo",
          },
        },
      }),
    );

    store.rescheduleJob(store.listJobs()[0].id, 0, "force_due");
    const processed = await flow.processDueJobs();
    expect(processed.sent).toBe(0);
    expect(processed.cancelled).toBe(1);
    expect(sendNps).not.toHaveBeenCalled();
  });

  it("defers send when current time is in quiet hours", async () => {
    // 01:00 Kyiv
    const nightNow = new Date("2026-08-03T22:00:00.000Z").getTime();
    const { store, flow, sendNps, resolveOrderSnapshot } = setup({
      now: nightNow,
      delayHours: 2,
      settings: { quietEnabled: true },
    });
    resolveOrderSnapshot.mockResolvedValue(null);

    await flow.handleWebhook(
      signedPayload({
        account: "demo",
        object: "incoming_order",
        object_id: "night-1",
        action: "changed",
        time: 123,
        data: {
          snapshot: {
            orderId: "night-1",
            objectType: "incoming_order",
            statusRaw: "delivered",
            statusNormalized: "delivered",
            phone: "+380501112233",
            account: "demo",
          },
        },
      }),
    );

    // Job was already deferred at schedule time to 09:00, so not due yet.
    expect(store.listJobs()[0].last_error).toBe("deferred_quiet_hours");
    const processed = await flow.processDueJobs();
    expect(processed.sent).toBe(0);
    expect(sendNps).not.toHaveBeenCalled();
  });
});
