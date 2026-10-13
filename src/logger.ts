import { config } from "./config.js";

const levels = ["debug", "info", "warn", "error"] as const;
type Level = (typeof levels)[number];

const current = levels.indexOf(config.logLevel);

function log(level: Level, message: string, meta?: unknown) {
  if (levels.indexOf(level) < current) return;
  const line = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(meta !== undefined ? { meta } : {}),
  };
  const method = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  method(JSON.stringify(line));
}

export const logger = {
  debug: (message: string, meta?: unknown) => log("debug", message, meta),
  info: (message: string, meta?: unknown) => log("info", message, meta),
  warn: (message: string, meta?: unknown) => log("warn", message, meta),
  error: (message: string, meta?: unknown) => log("error", message, meta),
};
