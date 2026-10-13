import { config } from "../config.js";
import { logger } from "../logger.js";
import type { SendNpsInput } from "../types.js";

export interface SendPulseClient {
  sendNps(input: SendNpsInput): Promise<{ ok: true; mode: string; details?: unknown }>;
}

function renderTemplate(template: string, input: SendNpsInput): string {
  return template
    .replaceAll("{{order_id}}", input.orderId)
    .replaceAll("{{name}}", input.customerName ?? "")
    .replaceAll("{{phone}}", input.phone ?? "");
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("380")) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 10) return `+38${digits}`;
  return digits.startsWith("+") ? digits : `+${digits}`;
}

export function createSendPulseClient(options?: {
  mode?: typeof config.sendpulseMode;
  fetchImpl?: typeof fetch;
}): SendPulseClient {
  const mode = options?.mode ?? config.sendpulseMode;
  const fetchImpl = options?.fetchImpl ?? fetch;
  let cachedToken: { value: string; expiresAt: number } | null = null;

  async function getAccessToken(): Promise<string> {
    if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
      return cachedToken.value;
    }
    if (!config.sendpulseApiId || !config.sendpulseApiSecret) {
      throw new Error("SENDPULSE_API_ID / SENDPULSE_API_SECRET are required for sms mode");
    }

    const response = await fetchImpl("https://api.sendpulse.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: config.sendpulseApiId,
        client_secret: config.sendpulseApiSecret,
      }),
    });

    if (!response.ok) {
      throw new Error(`SendPulse auth failed: ${response.status} ${await response.text()}`);
    }

    const json = (await response.json()) as { access_token: string; expires_in: number };
    cachedToken = {
      value: json.access_token,
      expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
    };
    return cachedToken.value;
  }

  async function sendViaAutomation360(input: SendNpsInput) {
    if (!config.sendpulseEventUrl) {
      throw new Error("SENDPULSE_EVENT_URL is required for automation360 mode");
    }
    if (!input.phone && !input.email) {
      throw new Error("phone or email is required to trigger Automation 360");
    }

    const body: Record<string, unknown> = {
      phone: input.phone ? normalizePhone(input.phone) : undefined,
      email: input.email,
      order_id: input.orderId,
      customer_name: input.customerName ?? "",
      account: input.account ?? "",
      event_date: new Date().toISOString().slice(0, 10),
    };

    if (config.sendpulseAutomationId) {
      body.automation_id = Number(config.sendpulseAutomationId);
    }

    const response = await fetchImpl(config.sendpulseEventUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`SendPulse event failed: ${response.status} ${text}`);
    }

    return { ok: true as const, mode: "automation360", details: text || { status: response.status } };
  }

  async function sendViaSms(input: SendNpsInput) {
    if (!input.phone) {
      throw new Error("phone is required for sms mode");
    }

    const token = await getAccessToken();
    const phone = normalizePhone(input.phone);
    const phonesNumeric = Number(phone.replace(/\D/g, ""));
    const body = renderTemplate(config.npsSmsTemplate, { ...input, phone });

    const response = await fetchImpl("https://api.sendpulse.com/sms/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        sender: config.sendpulseSmsSender,
        phones: [phonesNumeric],
        body,
      }),
    });

    const json = await response.json().catch(async () => ({ raw: await response.text() }));
    if (!response.ok) {
      throw new Error(`SendPulse SMS failed: ${response.status} ${JSON.stringify(json)}`);
    }

    return { ok: true as const, mode: "sms", details: json };
  }

  return {
    async sendNps(input: SendNpsInput) {
      if (mode === "dry-run") {
        logger.info("dry-run NPS send", input);
        return { ok: true as const, mode: "dry-run", details: input };
      }
      if (mode === "automation360") {
        return sendViaAutomation360(input);
      }
      if (mode === "sms") {
        return sendViaSms(input);
      }
      throw new Error(`Unsupported SENDPULSE_MODE: ${mode}`);
    },
  };
}
