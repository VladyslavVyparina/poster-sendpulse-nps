function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function pickString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return String(value);
    }
    const text = String(value).trim();
    if (text && text !== "0" && text.toLowerCase() !== "null") return text;
  }
  return undefined;
}

function phoneFromUnknown(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string" || typeof value === "number") {
    return pickString(value);
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = phoneFromUnknown(item);
      if (found) return found;
    }
    return undefined;
  }
  const record = asRecord(value);
  if (!record) return undefined;
  return pickString(
    record.phone,
    record.phone_number,
    record.client_phone,
    record.number,
    record.value,
    record.mobile,
    record.tel,
  );
}

  const PHONE_KEYS = [
  "phone",
  "phone_number",
  "client_phone",
  "customer_phone",
  "mobile",
  "mobile_phone",
  "tel",
  "telephone",
  "contact_phone",
  "delivery_phone",
] as const;

// Keep spaces out of stored phones for SendPulse
function cleanPhone(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(/[^\d+]/g, "");
  return cleaned || undefined;
}

const EMAIL_KEYS = ["email", "client_email", "customer_email", "mail"] as const;

export function extractContacts(source: unknown): {
  phone?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  clientId?: string;
} {
  const roots: Array<Record<string, unknown>> = [];
  const root = asRecord(source);
  if (root) {
    roots.push(root);
    for (const key of [
      "client",
      "customer",
      "user",
      "delivery",
      "delivery_info",
      "address",
      "client_info",
      "order",
      "incoming_order",
      "transaction",
    ]) {
      const nested = asRecord(root[key]);
      if (nested) roots.push(nested);
    }
  }

  let phone: string | undefined;
  let email: string | undefined;
  let firstName: string | undefined;
  let lastName: string | undefined;
  let clientId: string | undefined;

  for (const record of roots) {
    if (!phone) {
      for (const key of PHONE_KEYS) {
        phone = phone ?? pickString(record[key]);
      }
      phone =
        phone ??
        phoneFromUnknown(record.phones) ??
        phoneFromUnknown(record.client_phones) ??
        phoneFromUnknown(record.phone_numbers);
    }
    if (!email) {
      for (const key of EMAIL_KEYS) {
        email = email ?? pickString(record[key]);
      }
    }
    firstName =
      firstName ??
      pickString(
        record.first_name,
        record.firstname,
        record.client_firstname,
        record.client_name,
        record.name,
      );
    lastName =
      lastName ??
      pickString(record.last_name, record.lastname, record.client_lastname, record.surname);
    clientId = clientId ?? pickString(record.client_id, record.clientId, record.customer_id);
  }

  // "Jan Kowalski" style in client_name / name
  if (!lastName && firstName && firstName.includes(" ")) {
    const parts = firstName.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      firstName = parts[0];
      lastName = parts.slice(1).join(" ");
    }
  }

  return {
    phone: cleanPhone(phone),
    email,
    firstName,
    lastName,
    clientId,
  };
}

export function contactDebugKeys(source: unknown): string[] {
  const record = asRecord(source);
  if (!record) return [];
  return Object.keys(record).filter((key) =>
    /phone|email|client|name|mobile|tel|contact|address/i.test(key),
  );
}
