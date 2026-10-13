export type JobStatus = "pending" | "sent" | "cancelled" | "failed" | "skipped";

export interface PosterWebhookPayload {
  account: string;
  account_number?: string | number;
  object: string;
  object_id: string | number;
  action: string;
  time: string | number;
  verify: string;
  data?: unknown;
}

export interface OrderSnapshot {
  orderId: string;
  objectType: "incoming_order" | "transaction";
  statusRaw: string;
  statusNormalized: string;
  phone?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  clientId?: string;
  account: string;
}

export interface NpsJob {
  id: number;
  order_id: string;
  object_type: string;
  account: string;
  phone: string | null;
  email: string | null;
  customer_name: string | null;
  status_at_schedule: string;
  run_at: number;
  job_status: JobStatus;
  created_at: number;
  updated_at: number;
  last_error: string | null;
  payload_json: string;
}

export interface SendNpsInput {
  phone?: string;
  email?: string;
  orderId: string;
  customerName?: string;
  account?: string;
}
