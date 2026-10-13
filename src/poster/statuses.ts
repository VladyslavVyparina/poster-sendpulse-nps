const ALIASES: Record<string, string> = {
  // English
  new: "new",
  accepted: "accepted",
  applied: "accepted",
  processing: "processing",
  cooking: "processing",
  "in progress": "processing",
  scheduled: "scheduled",
  ready: "ready",
  "en route": "en_route",
  delivering: "en_route",
  delivered: "delivered",
  completed: "completed",
  closed: "completed",
  finished: "completed",
  cancelled: "cancelled",
  canceled: "cancelled",
  rejected: "cancelled",
  returned: "returned",
  // Ukrainian
  новий: "new",
  нова: "new",
  прийнятий: "accepted",
  прийнято: "accepted",
  "в обробці": "processing",
  обробка: "processing",
  готується: "processing",
  заплановано: "scheduled",
  запланований: "scheduled",
  готовий: "ready",
  готово: "ready",
  "в дорозі": "en_route",
  доставлено: "delivered",
  доставлений: "delivered",
  завершено: "completed",
  закрито: "completed",
  скасовано: "cancelled",
  відхилено: "cancelled",
  повернено: "returned",
  повернення: "returned",
  // Polish (Poster UI often uses PL labels)
  dostarczono: "delivered",
  dostarczone: "delivered",
  dostarczony: "delivered",
  "w dostawie": "en_route",
  zakończono: "completed",
  zakonczono: "completed",
  zakończone: "completed",
  zakonczone: "completed",
  zamknięto: "completed",
  zamknieto: "completed",
  zamknięte: "completed",
  zamkniete: "completed",
  otrzymano: "delivered",
  odebrano: "completed",
  anulowano: "cancelled",
  anulowane: "cancelled",
  odrzucono: "cancelled",
  odrzucone: "cancelled",
  zwrócono: "returned",
  zwrocono: "returned",
  "zwrot": "returned",
  // Additional cancel variations
  відмінено: "cancelled",
  відмовлено: "cancelled",
  "не виконано": "cancelled",
  refund: "returned",
  refunded: "returned",
  "повернено кошти": "returned",
  // Common Poster numeric codes (incoming_order + delivery extensions)
  "0": "new",
  "1": "accepted",
  "2": "completed",
  "3": "processing",
  "4": "scheduled",
  "5": "ready",
  "6": "en_route",
  "7": "cancelled",
  "8": "returned",
  "9": "cancelled",
  "10": "delivered",
};

export function normalizeStatus(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return "";
  const key = String(raw).trim().toLowerCase();
  if (!key) return "";
  return ALIASES[key] ?? key;
}

export function statusMatches(raw: string | number | null | undefined, list: string[]): boolean {
  const normalized = normalizeStatus(raw);
  if (!normalized) return false;
  const allowed = new Set(list.map((item) => normalizeStatus(item)));
  return allowed.has(normalized) || allowed.has(String(raw).trim().toLowerCase());
}

export function isTriggerStatus(raw: string | number | null | undefined, triggerStatuses: string[]): boolean {
  return statusMatches(raw, triggerStatuses);
}

export function isCancelStatus(raw: string | number | null | undefined, cancelStatuses: string[]): boolean {
  return statusMatches(raw, cancelStatuses);
}
