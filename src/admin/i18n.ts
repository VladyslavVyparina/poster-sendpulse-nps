export type AdminLang = "uk" | "en";

export function parseAdminLang(value: unknown): AdminLang {
  return value === "en" ? "en" : "uk";
}

export function langFromCookieHeader(cookieHeader: string | undefined): AdminLang | null {
  if (!cookieHeader) return null;
  const match = /(?:^|;\s*)admin_lang=(uk|en)(?:;|$)/.exec(cookieHeader);
  return match ? parseAdminLang(match[1]) : null;
}

const dict = {
  uk: {
    brandTitle: "FLESH Admin",
    brandSub: "Poster · SendPulse NPS",
    panel: "Панель",
    dashboard: "Дашборд",
    logout: "Вийти",
    topbarTitle: "Затримка, нічні години, статистика",
    themeToggle: "Змінити тему",
    loginTitle: "Вхід — FLESH Admin",
    loginHeading: "FLESH Admin",
    loginSub: "Poster → SendPulse NPS",
    username: "Логін",
    password: "Пароль",
    signIn: "Увійти",
    badCredentials: "Невірний логін або пароль",
    loginRequired: "Спочатку увійдіть",
    settingsSaved: "Налаштування збережено",
    tokenSaved: "Poster access token збережено",
    tokenRequired: "Вставте POSTER_ACCESS_TOKEN",
    settingsTitle: "Налаштування годин",
    delayLabel: "Затримка NPS після доставки",
    delayHint: "Оберіть години та хвилини. 0 год 0 хв — одразу (для тестів).",
    hours: "Години",
    minutes: "Хвилини",
    timezone: "Часовий пояс",
    timezoneHint: "Використовується для тихих нічних годин.",
    quietFrom: "Тиха ніч з",
    quietTo: "Тиха ніч до",
    quietHint: "Якщо відправка випадає в цей інтервал — NPS переноситься на кінець тихого вікна.",
    quietEnabled: "Не відправляти NPS вночі",
    saveSettings: "Зберегти налаштування",
    showAll: "Показати всі",
    jobsHintAll: "Оберіть картку статистики вище, щоб побачити заявки категорії. Клік по рядку — повні деталі.",
    jobsHintFiltered: "Список заявок у вибраній категорії. Клік по рядку — повні деталі.",
    emptyJobs: "У цій категорії поки немає заявок",
    colId: "ID",
    colOrder: "Замовлення",
    colPhone: "Телефон",
    colStatus: "Статус",
    colSend: "Відправка",
    colCreated: "Створено",
    colNote: "Примітка",
    type: "Тип",
    account: "Акаунт",
    client: "Клієнт",
    email: "Email",
    statusAtSchedule: "Статус при плануванні",
    updated: "Оновлено",
    payload: "Повний snapshot (payload)",
    tokenTitle: "Poster Access Token",
    status: "Статус",
    tokenSavedBadge: "збережено",
    tokenMissingBadge: "ще немає",
    tokenHint:
      "Webhook application сам по собі токен не дає, якщо app уже був підключений раніше і oAuth вимкнений. Надійний спосіб — OAuth.",
    tokenStep1: "У Poster → Настройки: увімкніть oAuth + Manage-платформа",
    tokenStep2: "«Страница подключения» поставте:",
    tokenStep3: "Сохранить → відкрийте лінк нижче і підтвердіть доступ",
    connectPoster: "Підключити Poster (OAuth)",
    pasteToken: "Або вставити токен вручну",
    saveToken: "Зберегти токен",
    credsTitle: "Токени для роботи системи",
    secretHint: "Секрет застосунку Poster — щоб перевіряти підпис webhook.",
    secretWhere: "Де взяти: Application → Application secret.",
    accessHint:
      "Щоб отримати автоматично: OAuth /poster-connect або webhook application після перевстановлення app.",
    eventHint: "Automation → Events → POST raw URL події poster_nps + запущена воронка з SMS.",
    webhookTitle: "Webhook URL у Poster",
    webhookEntities: "Сутності: application, incoming_order, transaction.",
    statPending: "Очікують",
    statPendingSub: "натисніть, щоб відкрити список",
    statSentToday: "Відправлено сьогодні",
    statSentSub: "усього sent",
    statCancelled: "Скасовано",
    statCancelledSub: "cancel / return до відправки",
    statDeferred: "Перенесено з ночі",
    statDeferredSub: "на ранок після quiet hours",
    statFailed: "Помилки",
    statFailedSub: "failed sends",
    statScheduled: "Заплановано на сьогодні",
    statScheduledSub: "run_at сьогодні",
    viewAll: "Останні завдання",
    viewPending: "Очікують",
    viewSentToday: "Відправлено сьогодні",
    viewCancelled: "Скасовано",
    viewDeferred: "Перенесено з ночі",
    viewFailed: "Помилки",
    viewScheduledToday: "Заплановано на сьогодні",
    statusPending: "очікує",
    statusSent: "відправлено",
    statusCancelled: "скасовано",
    statusFailed: "помилка",
    statusSkipped: "пропущено",
  },
  en: {
    brandTitle: "FLESH Admin",
    brandSub: "Poster · SendPulse NPS",
    panel: "Panel",
    dashboard: "Dashboard",
    logout: "Log out",
    topbarTitle: "Delay, quiet hours, statistics",
    themeToggle: "Toggle theme",
    loginTitle: "Sign in — FLESH Admin",
    loginHeading: "FLESH Admin",
    loginSub: "Poster → SendPulse NPS",
    username: "Username",
    password: "Password",
    signIn: "Sign in",
    badCredentials: "Invalid username or password",
    loginRequired: "Please sign in first",
    settingsSaved: "Settings saved",
    tokenSaved: "Poster access token saved",
    tokenRequired: "Paste POSTER_ACCESS_TOKEN",
    settingsTitle: "Time settings",
    delayLabel: "NPS delay after delivery",
    delayHint: "Choose hours and minutes. 0 h 0 min — immediate (for tests).",
    hours: "Hours",
    minutes: "Minutes",
    timezone: "Timezone",
    timezoneHint: "Used for quiet overnight hours.",
    quietFrom: "Quiet night from",
    quietTo: "Quiet night until",
    quietHint: "If send time falls in this window, NPS is deferred until the end of quiet hours.",
    quietEnabled: "Do not send NPS at night",
    saveSettings: "Save settings",
    showAll: "Show all",
    jobsHintAll: "Pick a stats card above to filter jobs. Click a row for full details.",
    jobsHintFiltered: "Jobs in the selected category. Click a row for full details.",
    emptyJobs: "No jobs in this category yet",
    colId: "ID",
    colOrder: "Order",
    colPhone: "Phone",
    colStatus: "Status",
    colSend: "Send at",
    colCreated: "Created",
    colNote: "Note",
    type: "Type",
    account: "Account",
    client: "Customer",
    email: "Email",
    statusAtSchedule: "Status when scheduled",
    updated: "Updated",
    payload: "Full snapshot (payload)",
    tokenTitle: "Poster Access Token",
    status: "Status",
    tokenSavedBadge: "saved",
    tokenMissingBadge: "missing",
    tokenHint:
      "The application webhook alone does not give a token if the app was already connected and oAuth was off. Use OAuth.",
    tokenStep1: "In Poster → Settings: enable oAuth + Manage platform",
    tokenStep2: "Set connection / redirect URL to:",
    tokenStep3: "Save → open the link below and approve access",
    connectPoster: "Connect Poster (OAuth)",
    pasteToken: "Or paste token manually",
    saveToken: "Save token",
    credsTitle: "Credentials for the system",
    secretHint: "Poster application secret — verifies webhook signatures.",
    secretWhere: "Where: Application → Application secret.",
    accessHint:
      "To obtain automatically: OAuth /poster-connect or application webhook after reinstalling the app.",
    eventHint: "Automation → Events → POST raw URL for poster_nps + launched SMS flow.",
    webhookTitle: "Webhook URL in Poster",
    webhookEntities: "Entities: application, incoming_order, transaction.",
    statPending: "Pending",
    statPendingSub: "click to open the list",
    statSentToday: "Sent today",
    statSentSub: "total sent",
    statCancelled: "Cancelled",
    statCancelledSub: "cancel / return before send",
    statDeferred: "Deferred overnight",
    statDeferredSub: "moved to morning after quiet hours",
    statFailed: "Failed",
    statFailedSub: "failed sends",
    statScheduled: "Scheduled today",
    statScheduledSub: "run_at today",
    viewAll: "Recent jobs",
    viewPending: "Pending",
    viewSentToday: "Sent today",
    viewCancelled: "Cancelled",
    viewDeferred: "Deferred overnight",
    viewFailed: "Failed",
    viewScheduledToday: "Scheduled today",
    statusPending: "pending",
    statusSent: "sent",
    statusCancelled: "cancelled",
    statusFailed: "failed",
    statusSkipped: "skipped",
  },
} as const;

export type I18nKey = keyof typeof dict.uk;

export function t(lang: AdminLang, key: I18nKey): string {
  return dict[lang][key] ?? dict.uk[key];
}

export function delayPartsFromHours(delayHours: number): { hours: number; minutes: number } {
  const totalMinutes = Math.max(0, Math.round(Number(delayHours) * 60));
  return {
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
  };
}

export function delayHoursFromParts(hours: number, minutes: number): number {
  const h = Math.max(0, Math.floor(Number(hours) || 0));
  const m = Math.max(0, Math.min(59, Math.floor(Number(minutes) || 0)));
  return h + m / 60;
}

export function delaySelectOptions(max: number, selected: number): string {
  const items: string[] = [];
  for (let i = 0; i <= max; i += 1) {
    const sel = i === selected ? " selected" : "";
    items.push(`<option value="${i}"${sel}>${i}</option>`);
  }
  return items.join("");
}
