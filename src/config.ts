import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const csv = (value: string | undefined, fallback: string[]) =>
  (value ?? fallback.join(","))
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

const schema = z.object({
  port: z.coerce.number().default(3000),
  /** Public URL of this server (IP or domain), no trailing slash */
  publicBaseUrl: z.string().default("http://173.242.59.183:3000"),
  nodeEnv: z.string().default("development"),
  posterApplicationId: z.coerce.number().int().positive().default(5178),
  posterApplicationSecret: z.string().default(""),
  posterAccessToken: z.string().default(""),
  posterAccount: z.string().optional(),
  triggerStatuses: z.array(z.string()).default([]),
  cancelStatuses: z.array(z.string()).default([]),
  npsDelayMs: z.coerce.number().int().positive().default(2 * 60 * 60 * 1000),
  quietEnabled: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? true : !["0", "false", "no", "off"].includes(v.toLowerCase()))),
  quietStart: z.string().default("00:00"),
  quietEnd: z.string().default("09:00"),
  timezone: z.string().default("Europe/Kyiv"),
  adminUser: z.string().default("admin"),
  adminPassword: z.string().default("NpsAdmin2026"),
  sessionSecret: z.string().default("nps-session-change-me"),
  sendpulseMode: z.enum(["automation360", "sms", "dry-run"]).default("dry-run"),
  sendpulseEventUrl: z.string().optional(),
  sendpulseAutomationId: z.string().optional(),
  sendpulseApiId: z.string().optional(),
  sendpulseApiSecret: z.string().optional(),
  sendpulseSmsSender: z.string().default("NPS"),
  npsSmsTemplate: z
    .string()
    .default(
      "Дякуємо за замовлення #{{order_id}}! Оцініть нас від 0 до 10 у відповідь на це SMS.",
    ),
  testApiKey: z.string().default("dev-test-key"),
  databasePath: z.string().default("./data/nps.sqlite"),
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

const parsed = schema.parse({
  port: process.env.PORT,
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || "http://173.242.59.183:3000").replace(
    /\/$/,
    "",
  ),
  nodeEnv: process.env.NODE_ENV,
  posterApplicationId: process.env.POSTER_APPLICATION_ID || 5178,
  posterApplicationSecret: process.env.POSTER_APPLICATION_SECRET,
  posterAccessToken: process.env.POSTER_ACCESS_TOKEN,
  posterAccount: process.env.POSTER_ACCOUNT || undefined,
  triggerStatuses: csv(process.env.POSTER_TRIGGER_STATUSES, [
    "delivered",
    "completed",
    "доставлено",
    "завершено",
    "closed",
    "10",
  ]),
  cancelStatuses: csv(process.env.POSTER_CANCEL_STATUSES, [
    "cancelled",
    "canceled",
    "returned",
    "rejected",
    "скасовано",
    "повернено",
    "відмінено",
    "відхилено",
    "anulowano",
    "7",
    "8",
    "9",
  ]),
  npsDelayMs: process.env.NPS_DELAY_MS,
  quietEnabled: process.env.QUIET_HOURS_ENABLED,
  quietStart: process.env.QUIET_HOURS_START,
  quietEnd: process.env.QUIET_HOURS_END,
  timezone: process.env.TIMEZONE,
  adminUser: process.env.ADMIN_USER || "admin",
  adminPassword: process.env.ADMIN_PASSWORD || "NpsAdmin2026",
  sessionSecret: process.env.SESSION_SECRET || "nps-session-change-me",
  sendpulseMode: process.env.SENDPULSE_MODE,
  sendpulseEventUrl: process.env.SENDPULSE_EVENT_URL || undefined,
  sendpulseAutomationId: process.env.SENDPULSE_AUTOMATION_ID || undefined,
  sendpulseApiId: process.env.SENDPULSE_API_ID || undefined,
  sendpulseApiSecret: process.env.SENDPULSE_API_SECRET || undefined,
  sendpulseSmsSender: process.env.SENDPULSE_SMS_SENDER,
  npsSmsTemplate: process.env.NPS_SMS_TEMPLATE,
  testApiKey: process.env.TEST_API_KEY,
  databasePath: process.env.DATABASE_PATH,
  logLevel: process.env.LOG_LEVEL,
});

export type AppConfig = z.infer<typeof schema>;
export const config: AppConfig = parsed;
