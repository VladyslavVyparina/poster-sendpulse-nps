import { config } from "../config.js";
import { logger } from "../logger.js";
import type { OrderSnapshot } from "../types.js";
import { contactDebugKeys, extractContacts } from "./contacts.js";
import { normalizeStatus } from "./statuses.js";

export interface PosterApiClient {
  getIncomingOrder(orderId: string | number): Promise<Record<string, unknown> | null>;
  getTransaction(transactionId: string | number): Promise<Record<string, unknown> | null>;
  getClient(clientId: string | number): Promise<Record<string, unknown> | null>;
  resolveOrderSnapshot(input: {
    object: string;
    objectId: string | number;
    account: string;
    webhookData?: unknown;
  }): Promise<OrderSnapshot | null>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function firstRecord(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const record = asRecord(item);
      if (record) return record;
    }
    return null;
  }
  return asRecord(value);
}

function pickString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text && text !== "0" && text.toLowerCase() !== "null") return text;
  }
  return undefined;
}

export function createPosterClient(options?: {
  accessToken?: string;
  getAccessToken?: () => string | null | undefined;
  fetchImpl?: typeof fetch;
}): PosterApiClient {
  const fetchImpl = options?.fetchImpl ?? fetch;

  function resolveAccessToken(): string {
    return (
      options?.getAccessToken?.() ||
      options?.accessToken ||
      config.posterAccessToken ||
      ""
    );
  }

  async function apiGet(method: string, params: Record<string, string>): Promise<unknown> {
    const accessToken = resolveAccessToken();
    if (!accessToken) {
      logger.warn("Poster access token is empty; API call skipped", { method });
      return null;
    }

    const url = new URL(`https://joinposter.com/api/${method}`);
    url.searchParams.set("token", accessToken);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = await fetchImpl(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Poster API ${method} failed: ${response.status} ${body}`);
    }

    const json = (await response.json()) as { response?: unknown; error?: unknown };
    if (json.error) {
      throw new Error(`Poster API ${method} error: ${JSON.stringify(json.error)}`);
    }
    return json.response ?? null;
  }

  async function getIncomingOrder(orderId: string | number) {
    const response = await apiGet("incomingOrders.getIncomingOrder", {
      incoming_order_id: String(orderId),
    });
    return firstRecord(response);
  }

  async function getTransaction(transactionId: string | number) {
    try {
      const response = await apiGet("dash.getTransaction", {
        transaction_id: String(transactionId),
      });
      return firstRecord(response);
    } catch (error) {
      logger.warn("dash.getTransaction failed, trying transactions.getTransaction", {
        error: String(error),
      });
      const response = await apiGet("transactions.getTransaction", {
        transaction_id: String(transactionId),
      });
      return firstRecord(response);
    }
  }

  async function getClient(clientId: string | number) {
    const response = await apiGet("clients.getClient", {
      client_id: String(clientId),
    });
    return firstRecord(response);
  }

  async function enrichFromClient(
    clientId: string | undefined,
    current: ReturnType<typeof extractContacts>,
  ): Promise<ReturnType<typeof extractContacts>> {
    if (!clientId || clientId === "0") return current;
    if (current.phone && current.email) return current;
    try {
      const client = await getClient(clientId);
      if (!client) return current;
      const fromClient = extractContacts(client);
      return {
        phone: current.phone ?? fromClient.phone,
        email: current.email ?? fromClient.email,
        firstName: current.firstName ?? fromClient.firstName,
        lastName: current.lastName ?? fromClient.lastName,
        clientId: current.clientId ?? fromClient.clientId ?? clientId,
      };
    } catch (error) {
      logger.warn("clients.getClient failed while enriching contacts", {
        clientId,
        error: String(error),
      });
      return current;
    }
  }

  async function resolveOrderSnapshot(input: {
    object: string;
    objectId: string | number;
    account: string;
    webhookData?: unknown;
  }): Promise<OrderSnapshot | null> {
    const object = input.object.toLowerCase();
    const fromWebhook = extractContacts(input.webhookData);

    if (object === "incoming_order") {
      let order: Record<string, unknown> | null = null;
      try {
        order = await getIncomingOrder(input.objectId);
      } catch (error) {
        logger.warn("incomingOrders.getIncomingOrder failed", {
          orderId: input.objectId,
          error: String(error),
        });
      }

      // ChoiceQR / Wolt / etc. often send webhook as incoming_order, but ID is a transaction.
      if (!order) {
        logger.info("Falling back to transaction lookup for incoming_order id", {
          orderId: input.objectId,
        });
        return resolveOrderSnapshot({
          ...input,
          object: "transaction",
        });
      }

      let contacts = extractContacts(order);
      contacts = {
        phone: contacts.phone ?? fromWebhook.phone,
        email: contacts.email ?? fromWebhook.email,
        firstName: contacts.firstName ?? fromWebhook.firstName,
        lastName: contacts.lastName ?? fromWebhook.lastName,
        clientId: contacts.clientId ?? fromWebhook.clientId,
      };
      contacts = await enrichFromClient(contacts.clientId, contacts);

      const statusRaw =
        pickString(
          order.status_name,
          order.statusName,
          order.status,
          asRecord(input.webhookData)?.status_name,
          asRecord(input.webhookData)?.status,
        ) ?? "";

      if (!contacts.phone && !contacts.email) {
        logger.warn("Incoming order has triggerable status but no contacts in API/webhook", {
          orderId: String(order.incoming_order_id ?? input.objectId),
          clientId: contacts.clientId ?? null,
          statusRaw,
          contactKeys: contactDebugKeys(order),
          webhookKeys: contactDebugKeys(input.webhookData),
        });
      }

      return {
        orderId: String(order.incoming_order_id ?? input.objectId),
        objectType: "incoming_order",
        statusRaw,
        statusNormalized: normalizeStatus(statusRaw),
        phone: contacts.phone,
        email: contacts.email,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        clientId: contacts.clientId,
        account: input.account,
      };
    }

    if (object === "transaction" || object === "client_payed_sum") {
      let tx: Record<string, unknown> | null = null;
      try {
        tx = await getTransaction(input.objectId);
      } catch (error) {
        logger.warn("transaction fetch failed", {
          transactionId: input.objectId,
          error: String(error),
        });
      }

      // Do NOT invent "completed" without details — that caused mass missing_contact skips.
      if (!tx) {
        if (!fromWebhook.phone && !fromWebhook.email) {
          return null;
        }
        return {
          orderId: String(input.objectId),
          objectType: "transaction",
          statusRaw: pickString(asRecord(input.webhookData)?.status, "completed") ?? "completed",
          statusNormalized: "completed",
          phone: fromWebhook.phone,
          email: fromWebhook.email,
          firstName: fromWebhook.firstName,
          lastName: fromWebhook.lastName,
          clientId: fromWebhook.clientId,
          account: input.account,
        };
      }

      let contacts = extractContacts(tx);
      contacts = {
        phone: contacts.phone ?? fromWebhook.phone,
        email: contacts.email ?? fromWebhook.email,
        firstName: contacts.firstName ?? fromWebhook.firstName,
        lastName: contacts.lastName ?? fromWebhook.lastName,
        clientId: contacts.clientId ?? fromWebhook.clientId,
      };
      contacts = await enrichFromClient(contacts.clientId, contacts);

      const statusRaw =
        pickString(
          tx.status_name,
          tx.processing_status,
          tx.status,
          tx.date_close ? "completed" : "",
          asRecord(input.webhookData)?.status,
        ) ?? "completed";

      if (!contacts.phone && !contacts.email) {
        logger.warn("Transaction has no phone/email for NPS", {
          orderId: String(tx.transaction_id ?? input.objectId),
          clientId: contacts.clientId ?? null,
          statusRaw,
          contactKeys: contactDebugKeys(tx),
        });
      }

      return {
        orderId: String(tx.transaction_id ?? input.objectId),
        objectType: "transaction",
        statusRaw,
        statusNormalized: normalizeStatus(statusRaw),
        phone: contacts.phone,
        email: contacts.email,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        clientId: contacts.clientId,
        account: input.account,
      };
    }

    return null;
  }

  return {
    getIncomingOrder,
    getTransaction,
    getClient,
    resolveOrderSnapshot,
  };
}
