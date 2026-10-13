import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { config } from "../config.js";
import {
  DEFAULT_RUNTIME_SETTINGS,
  type RuntimeSettings,
  validateRuntimeSettings,
} from "../settings/runtime.js";
import type { JobStatus, NpsJob, OrderSnapshot } from "../types.js";

export interface JobStats {
  counts: Record<string, number>;
  pending: number;
  sent: number;
  cancelled: number;
  failed: number;
  skipped: number;
  sentToday: number;
  scheduledToday: number;
  deferredPending: number;
  total: number;
}

export type StatsFilter =
  | "all"
  | "pending"
  | "sent_today"
  | "cancelled"
  | "deferred"
  | "failed"
  | "scheduled_today";

export class JobStore {
  private db: Database.Database;

  constructor(databasePath: string) {
    const dir = path.dirname(databasePath);
    fs.mkdirSync(dir, { recursive: true });
    this.db = new Database(databasePath);
    this.db.pragma("journal_mode = WAL");
    this.migrate();
    this.ensureDefaultSettings();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS nps_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id TEXT NOT NULL,
        object_type TEXT NOT NULL,
        account TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        customer_name TEXT,
        status_at_schedule TEXT NOT NULL,
        run_at INTEGER NOT NULL,
        job_status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_error TEXT,
        payload_json TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_nps_jobs_pending_run
        ON nps_jobs(job_status, run_at);

      CREATE INDEX IF NOT EXISTS idx_nps_jobs_order
        ON nps_jobs(account, order_id, job_status);

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  private ensureDefaultSettings() {
    const defaults: RuntimeSettings = {
      ...DEFAULT_RUNTIME_SETTINGS,
      delayHours: config.npsDelayMs / (60 * 60 * 1000),
      quietEnabled: config.quietEnabled,
      quietStart: config.quietStart,
      quietEnd: config.quietEnd,
      timezone: config.timezone,
    };

    const insert = this.db.prepare(
      `INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)`,
    );
    insert.run("delay_hours", String(defaults.delayHours));
    insert.run("quiet_enabled", defaults.quietEnabled ? "1" : "0");
    insert.run("quiet_start", defaults.quietStart);
    insert.run("quiet_end", defaults.quietEnd);
    insert.run("timezone", defaults.timezone);
  }

  close() {
    this.db.close();
  }

  getSettings(): RuntimeSettings {
    const rows = this.db.prepare(`SELECT key, value FROM app_settings`).all() as Array<{
      key: string;
      value: string;
    }>;
    const map = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    return validateRuntimeSettings({
      delayHours: Number(map.delay_hours ?? DEFAULT_RUNTIME_SETTINGS.delayHours),
      quietEnabled: (map.quiet_enabled ?? "1") === "1",
      quietStart: map.quiet_start ?? DEFAULT_RUNTIME_SETTINGS.quietStart,
      quietEnd: map.quiet_end ?? DEFAULT_RUNTIME_SETTINGS.quietEnd,
      timezone: map.timezone ?? DEFAULT_RUNTIME_SETTINGS.timezone,
    });
  }

  saveSettings(settings: RuntimeSettings): RuntimeSettings {
    const validated = validateRuntimeSettings(settings);
    const upsert = this.db.prepare(
      `INSERT INTO app_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    );
    const tx = this.db.transaction(() => {
      upsert.run("delay_hours", String(validated.delayHours));
      upsert.run("quiet_enabled", validated.quietEnabled ? "1" : "0");
      upsert.run("quiet_start", validated.quietStart);
      upsert.run("quiet_end", validated.quietEnd);
      upsert.run("timezone", validated.timezone);
    });
    tx();
    return validated;
  }

  getSetting(key: string): string | null {
    const row = this.db.prepare(`SELECT value FROM app_settings WHERE key = ?`).get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  setSetting(key: string, value: string) {
    this.db
      .prepare(
        `INSERT INTO app_settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(key, value);
  }

  getPosterAccessToken(): string | null {
    return this.getSetting("poster_access_token") || config.posterAccessToken || null;
  }

  savePosterAccessToken(token: string) {
    this.setSetting("poster_access_token", token);
  }

  scheduleJob(snapshot: OrderSnapshot, runAt: number, note?: string | null): NpsJob {
    const now = Date.now();
    const customerName = [snapshot.firstName, snapshot.lastName].filter(Boolean).join(" ") || null;

    this.db
      .prepare(
        `UPDATE nps_jobs
         SET job_status = 'cancelled', updated_at = ?, last_error = 'superseded_by_new_schedule'
         WHERE account = ? AND order_id = ? AND job_status = 'pending'`,
      )
      .run(now, snapshot.account, snapshot.orderId);

    const result = this.db
      .prepare(
        `INSERT INTO nps_jobs (
          order_id, object_type, account, phone, email, customer_name,
          status_at_schedule, run_at, job_status, created_at, updated_at, last_error, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
      )
      .run(
        snapshot.orderId,
        snapshot.objectType,
        snapshot.account,
        snapshot.phone ?? null,
        snapshot.email ?? null,
        customerName,
        snapshot.statusNormalized || snapshot.statusRaw,
        runAt,
        now,
        now,
        note ?? null,
        JSON.stringify(snapshot),
      );

    return this.getJob(Number(result.lastInsertRowid))!;
  }

  cancelPendingForOrder(account: string, orderId: string, reason: string): number {
    const now = Date.now();
    const result = this.db
      .prepare(
        `UPDATE nps_jobs
         SET job_status = 'cancelled', updated_at = ?, last_error = ?
         WHERE account = ? AND order_id = ? AND job_status = 'pending'`,
      )
      .run(now, reason, account, orderId);
    return result.changes;
  }

  rescheduleJob(id: number, runAt: number, reason: string) {
    this.db
      .prepare(
        `UPDATE nps_jobs
         SET run_at = ?, updated_at = ?, last_error = ?
         WHERE id = ? AND job_status = 'pending'`,
      )
      .run(runAt, Date.now(), reason, id);
  }

  getDueJobs(now = Date.now(), limit = 50): NpsJob[] {
    return this.db
      .prepare(
        `SELECT * FROM nps_jobs
         WHERE job_status = 'pending' AND run_at <= ?
         ORDER BY run_at ASC
         LIMIT ?`,
      )
      .all(now, limit) as NpsJob[];
  }

  updateJobStatus(id: number, jobStatus: JobStatus, lastError: string | null = null) {
    this.db
      .prepare(
        `UPDATE nps_jobs
         SET job_status = ?, updated_at = ?, last_error = ?
         WHERE id = ?`,
      )
      .run(jobStatus, Date.now(), lastError, id);
  }

  getJob(id: number): NpsJob | null {
    const row = this.db.prepare(`SELECT * FROM nps_jobs WHERE id = ?`).get(id);
    return (row as NpsJob) ?? null;
  }

  listJobs(limit = 100): NpsJob[] {
    return this.db
      .prepare(`SELECT * FROM nps_jobs ORDER BY id DESC LIMIT ?`)
      .all(limit) as NpsJob[];
  }

  countByStatus(): Record<string, number> {
    const rows = this.db
      .prepare(`SELECT job_status, COUNT(*) as cnt FROM nps_jobs GROUP BY job_status`)
      .all() as Array<{ job_status: string; cnt: number }>;
    return Object.fromEntries(rows.map((row) => [row.job_status, row.cnt]));
  }

  private dayKey(ms: number, timezone: string): string {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(ms));
  }

  listJobsByFilter(filter: StatsFilter, timezone: string, limit = 200): NpsJob[] {
    const today = this.dayKey(Date.now(), timezone);
    const jobs = this.listJobs(5000);

    const matched = jobs.filter((job) => {
      switch (filter) {
        case "pending":
          return job.job_status === "pending";
        case "sent_today":
          return job.job_status === "sent" && this.dayKey(job.updated_at, timezone) === today;
        case "cancelled":
          return job.job_status === "cancelled";
        case "deferred":
          return (
            job.job_status === "pending" &&
            typeof job.last_error === "string" &&
            job.last_error.includes("quiet")
          );
        case "failed":
          return job.job_status === "failed";
        case "scheduled_today":
          return job.job_status === "pending" && this.dayKey(job.run_at, timezone) === today;
        case "all":
        default:
          return true;
      }
    });

    return matched.slice(0, limit);
  }

  getStats(timezone: string): JobStats {
    const counts = this.countByStatus();
    const pending = counts.pending ?? 0;
    const sent = counts.sent ?? 0;
    const cancelled = counts.cancelled ?? 0;
    const failed = counts.failed ?? 0;
    const skipped = counts.skipped ?? 0;

    const jobs = this.listJobs(5000);
    const today = this.dayKey(Date.now(), timezone);

    let sentToday = 0;
    let scheduledToday = 0;
    let deferredPending = 0;

    for (const job of jobs) {
      if (job.job_status === "sent" && this.dayKey(job.updated_at, timezone) === today) sentToday += 1;
      if (job.job_status === "pending" && this.dayKey(job.run_at, timezone) === today) {
        scheduledToday += 1;
      }
      if (
        job.job_status === "pending" &&
        typeof job.last_error === "string" &&
        job.last_error.includes("quiet")
      ) {
        deferredPending += 1;
      }
    }

    return {
      counts,
      pending,
      sent,
      cancelled,
      failed,
      skipped,
      sentToday,
      scheduledToday,
      deferredPending,
      total: pending + sent + cancelled + failed + skipped,
    };
  }
}
