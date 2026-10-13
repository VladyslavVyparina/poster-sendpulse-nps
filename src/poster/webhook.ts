import crypto from "node:crypto";
import type { PosterWebhookPayload } from "../types.js";

export function verifyPosterWebhook(
  payload: PosterWebhookPayload,
  applicationSecret: string,
): boolean {
  if (!applicationSecret) {
    // In local/dev without secret we accept, but production should set it.
    return true;
  }

  const verifyOriginal = payload.verify;
  const parts: Array<string | number> = [
    payload.account,
    payload.object,
    payload.object_id,
    payload.action,
  ];

  if (payload.data !== undefined && payload.data !== null) {
    parts.push(
      typeof payload.data === "string" ? payload.data : JSON.stringify(payload.data),
    );
  }

  parts.push(payload.time);
  parts.push(applicationSecret);

  const expected = crypto.createHash("md5").update(parts.join(";")).digest("hex");
  return expected === verifyOriginal;
}

export function buildPosterVerify(
  payload: Omit<PosterWebhookPayload, "verify">,
  applicationSecret: string,
): string {
  const parts: Array<string | number> = [
    payload.account,
    payload.object,
    payload.object_id,
    payload.action,
  ];
  if (payload.data !== undefined && payload.data !== null) {
    parts.push(
      typeof payload.data === "string" ? payload.data : JSON.stringify(payload.data),
    );
  }
  parts.push(payload.time);
  parts.push(applicationSecret);
  return crypto.createHash("md5").update(parts.join(";")).digest("hex");
}
