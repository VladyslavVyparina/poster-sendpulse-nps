import { config } from "../config.js";
import type { JobStore } from "../db/database.js";
import { logger } from "../logger.js";
import type { PosterApiClient } from "../poster/client.js";
import { isCancelStatus, isTriggerStatus } from "../poster/statuses.js";
import { verifyPosterWebhook } from "../poster/webhook.js";
import type { SendPulseClient } from "../sendpulse/client.js";
import {
  adjustRunAtForQuietHours,
  computeRunAt,
  isInQuietWindow,
  type RuntimeSettings,
} from "../settings/runtime.js";
import type { OrderSnapshot, PosterWebhookPayload } from "../types.js";

const RELEVANT_OBJECTS = new Set([
  "incoming_order",
  "transaction",
  "client_payed_sum",
  "application",
]);

export class NpsFlowService {
  constructor(
    private readonly store: JobStore,
    private readonly poster: PosterApiClient,
    private readonly sendpulse: SendPulseClient,
    private readonly deps: {
      now: () => number;
      getSettings: () => RuntimeSettings;
      triggerStatuses: string[];
      cancelStatuses: string[];
      posterSecret: string;
      posterAccount?: string;
    } = {
      now: () => Date.now(),
      getSettings: () => store.getSettings(),
      triggerStatuses: config.triggerStatuses,
      cancelStatuses: config.cancelStatuses,
      posterSecret: config.posterApplicationSecret,
      posterAccount: config.posterAccount,
    },
  ) {}

  async handleWebhook(payload: PosterWebhookPayload): Promise<{
    accepted: boolean;
    action: string;
    details?: unknown;
  }> {
    if (!verifyPosterWebhook(payload, this.deps.posterSecret)) {
      logger.warn("Invalid Poster webhook signature", {
        account: payload.account,
        object: payload.object,
        action: payload.action,
      });
      return { accepted: false, action: "invalid_signature" };
    }

    if (this.deps.posterAccount && payload.account !== this.deps.posterAccount) {
      logger.info("Ignored webhook for other account", {
        account: payload.account,
        expected: this.deps.posterAccount,
      });
      return { accepted: true, action: "ignored_account", details: { account: payload.account } };
    }

    const object = String(payload.object || "").toLowerCase();
    const webhookDataRecord =
      payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)
        ? (payload.data as Record<string, unknown>)
        : null;
    const webhookStatus =
      webhookDataRecord?.status_name ??
      webhookDataRecord?.status ??
      webhookDataRecord?.processing_status ??
      null;

    logger.info("Poster webhook received", {
      account: payload.account,
      object,
      objectId: payload.object_id,
      action: payload.action,
      webhookStatus,
      hasData: !!payload.data,
    });

    // Poster may send access_token on install/connect (object=application).
    if (object === "application") {
      const accessToken = extractAccessToken(payload.data);
      if (accessToken) {
        this.store.savePosterAccessToken(accessToken);
        logger.info("Saved Poster access_token from application webhook", {
          account: payload.account,
          action: payload.action,
        });
        return {
          accepted: true,
          action: "access_token_saved",
          details: { account: payload.account, tokenPreview: `${accessToken.slice(0, 6)}…` },
        };
      }
      logger.warn("application webhook without access_token — use OAuth /poster-connect", {
        account: payload.account,
        action: payload.action,
        dataKeys:
          payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)
            ? Object.keys(payload.data as object)
            : typeof payload.data,
      });
      return {
        accepted: true,
        action: "application_webhook_no_token",
        details: { action: payload.action },
      };
    }

    if (!RELEVANT_OBJECTS.has(object)) {
      return { accepted: true, action: "ignored_object", details: { object } };
    }

    if (!["added", "changed", "transformed"].includes(String(payload.action))) {
      return { accepted: true, action: "ignored_action", details: { action: payload.action } };
    }

    let snapshot: OrderSnapshot | null = null;

    if (
      payload.data &&
      typeof payload.data === "object" &&
      !Array.isArray(payload.data) &&
      "snapshot" in (payload.data as Record<string, unknown>)
    ) {
      snapshot = (payload.data as { snapshot: OrderSnapshot }).snapshot;
    } else {
      snapshot = await this.poster.resolveOrderSnapshot({
        object,
        objectId: payload.object_id,
        account: payload.account,
        webhookData: payload.data,
      });
    }

    if (!snapshot) {
      logger.warn("Could not resolve order snapshot", {
        object,
        objectId: payload.object_id,
      });
      return { accepted: true, action: "snapshot_missing" };
    }

    // Cancel always wins: pending NPS must not be sent after cancel/return.
    if (isCancelStatus(snapshot.statusRaw, this.deps.cancelStatuses)) {
      const cancelled = this.store.cancelPendingForOrder(
        snapshot.account,
        snapshot.orderId,
        `status_${snapshot.statusNormalized || snapshot.statusRaw}`,
      );
      logger.info("Cancel status detected — cancelled pending NPS jobs", {
        orderId: snapshot.orderId,
        account: snapshot.account,
        statusRaw: snapshot.statusRaw,
        statusNormalized: snapshot.statusNormalized,
        jobsCancelled: cancelled,
      });
      return {
        accepted: true,
        action: "cancelled_pending",
        details: {
          orderId: snapshot.orderId,
          cancelled,
          statusRaw: snapshot.statusRaw,
          statusNormalized: snapshot.statusNormalized,
        },
      };
    }

    if (!isTriggerStatus(snapshot.statusRaw, this.deps.triggerStatuses)) {
      logger.info("Status is not an NPS trigger", {
        orderId: snapshot.orderId,
        statusRaw: snapshot.statusRaw,
        statusNormalized: snapshot.statusNormalized,
      });
      return {
        accepted: true,
        action: "status_not_trigger",
        details: {
          orderId: snapshot.orderId,
          status: snapshot.statusNormalized || snapshot.statusRaw,
          statusRaw: snapshot.statusRaw,
        },
      };
    }

    if (!snapshot.phone && !snapshot.email) {
      logger.warn("Trigger status but no phone/email", {
        orderId: snapshot.orderId,
        objectType: snapshot.objectType,
        clientId: snapshot.clientId ?? null,
        statusRaw: snapshot.statusRaw,
        statusNormalized: snapshot.statusNormalized,
      });
      return {
        accepted: true,
        action: "missing_contact",
        details: {
          orderId: snapshot.orderId,
          objectType: snapshot.objectType,
          clientId: snapshot.clientId ?? null,
          status: snapshot.statusNormalized || snapshot.statusRaw,
        },
      };
    }

    const settings = this.deps.getSettings();
    const schedule = computeRunAt(this.deps.now(), settings);
    const note = schedule.deferred ? "deferred_quiet_hours" : null;
    const job = this.store.scheduleJob(snapshot, schedule.runAt, note);

    logger.info("Scheduled NPS job", {
      jobId: job.id,
      orderId: snapshot.orderId,
      runAt: new Date(schedule.runAt).toISOString(),
      deferred: schedule.deferred,
      delayHours: settings.delayHours,
      status: snapshot.statusNormalized,
    });

    return {
      accepted: true,
      action: "scheduled",
      details: {
        jobId: job.id,
        orderId: snapshot.orderId,
        runAt: schedule.runAt,
        delayMs: schedule.delayMs,
        deferredQuietHours: schedule.deferred,
        settings: {
          delayHours: settings.delayHours,
          quietStart: settings.quietStart,
          quietEnd: settings.quietEnd,
          timezone: settings.timezone,
        },
      },
    };
  }

  async processDueJobs(limit = 50): Promise<{
    processed: number;
    sent: number;
    failed: number;
    deferred: number;
    cancelled: number;
    skipped: number;
  }> {
    const due = this.store.getDueJobs(this.deps.now(), limit);
    const settings = this.deps.getSettings();
    let sent = 0;
    let failed = 0;
    let deferred = 0;
    let cancelled = 0;
    let skipped = 0;

    for (const job of due) {
      try {
        let latest = null as Awaited<ReturnType<PosterApiClient["resolveOrderSnapshot"]>>;
        let apiCheckFailed = false;
        try {
          latest = await this.poster.resolveOrderSnapshot({
            object: job.object_type,
            objectId: job.order_id,
            account: job.account,
          });
        } catch (error) {
          apiCheckFailed = true;
          logger.warn("Could not re-check order before send", {
            jobId: job.id,
            orderId: job.order_id,
            error: String(error),
          });
        }

        // SAFETY: If API check failed AND the job was created recently (< 24h),
        // reschedule to try again later instead of risking send to cancelled order.
        // For older jobs, proceed to avoid infinite retry loop.
        const jobAgeMs = this.deps.now() - job.created_at;
        const maxRetryAgeMs = 24 * 60 * 60 * 1000; // 24 hours
        if (apiCheckFailed && jobAgeMs < maxRetryAgeMs) {
          const retryDelayMs = 10 * 60 * 1000; // 10 minutes
          const newRunAt = this.deps.now() + retryDelayMs;
          this.store.rescheduleJob(job.id, newRunAt, "api_check_failed_retry");
          logger.info("Rescheduled job due to API check failure", {
            jobId: job.id,
            orderId: job.order_id,
            newRunAt: new Date(newRunAt).toISOString(),
          });
          skipped += 1;
          continue;
        }

        // Log the re-check result for debugging
        if (latest) {
          logger.debug("Re-check order status before send", {
            jobId: job.id,
            orderId: job.order_id,
            statusRaw: latest.statusRaw,
            statusNormalized: latest.statusNormalized,
            isCancelStatus: isCancelStatus(latest.statusRaw, this.deps.cancelStatuses),
            cancelStatuses: this.deps.cancelStatuses,
          });
        }

        // Check if order was cancelled/returned
        if (latest && isCancelStatus(latest.statusRaw, this.deps.cancelStatuses)) {
          logger.info("Order cancelled — skipping NPS send", {
            jobId: job.id,
            orderId: job.order_id,
            statusRaw: latest.statusRaw,
            statusNormalized: latest.statusNormalized,
          });
          this.store.updateJobStatus(job.id, "cancelled", `cancelled_before_send:${latest.statusRaw}`);
          cancelled += 1;
          continue;
        }

        // Never send at night: if still in quiet window, push to quietEnd.
        if (isInQuietWindow(new Date(this.deps.now()), settings)) {
          const adjusted = adjustRunAtForQuietHours(this.deps.now(), settings);
          this.store.rescheduleJob(job.id, adjusted.runAt, "deferred_quiet_hours_on_send");
          deferred += 1;
          continue;
        }

        const phone = latest?.phone ?? job.phone ?? undefined;
        const email = latest?.email ?? job.email ?? undefined;
        const customerName =
          [latest?.firstName, latest?.lastName].filter(Boolean).join(" ") ||
          job.customer_name ||
          undefined;

        if (!phone && !email) {
          this.store.updateJobStatus(job.id, "failed", "missing_contact_at_send");
          failed += 1;
          continue;
        }

        await this.sendpulse.sendNps({
          phone,
          email,
          orderId: job.order_id,
          customerName,
          account: job.account,
        });

        this.store.updateJobStatus(job.id, "sent");
        sent += 1;
      } catch (error) {
        failed += 1;
        this.store.updateJobStatus(job.id, "failed", String(error));
        logger.error("Failed to process NPS job", { jobId: job.id, error: String(error) });
      }
    }

    return { processed: due.length, sent, failed, deferred, cancelled, skipped };
  }
}

function extractAccessToken(data: unknown): string | undefined {
  if (!data) return undefined;
  if (typeof data === "string") {
    try {
      return extractAccessToken(JSON.parse(data));
    } catch {
      return undefined;
    }
  }
  if (typeof data !== "object" || Array.isArray(data)) return undefined;
  const record = data as Record<string, unknown>;
  const direct = record.access_token;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const nested = record.data;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const nestedToken = (nested as Record<string, unknown>).access_token;
    if (typeof nestedToken === "string" && nestedToken.trim()) return nestedToken.trim();
  }
  return undefined;
}
