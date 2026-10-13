import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import session from "express-session";
import {
  delayHoursFromParts,
  langFromCookieHeader,
  parseAdminLang,
  t,
  type AdminLang,
} from "./admin/i18n.js";
import { renderDashboardPage, renderLoginPage } from "./admin/render.js";
import { config } from "./config.js";
import type { JobStore, StatsFilter } from "./db/database.js";
import { logger } from "./logger.js";
import {
  exchangePosterAuthCode,
  getPosterAuthorizeUrl,
  getPosterConnectUrl,
} from "./poster/oauth.js";
import type { PosterApiClient } from "./poster/client.js";
import { normalizeStatus } from "./poster/statuses.js";
import { buildPosterVerify } from "./poster/webhook.js";
import type { NpsFlowService } from "./services/nps-flow.js";
import { validateRuntimeSettings } from "./settings/runtime.js";
import type { PosterWebhookPayload } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp(deps: {
  store: JobStore;
  flow: NpsFlowService;
  poster: PosterApiClient;
}) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      name: "nps_admin",
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    }),
  );
  app.use("/admin/static", express.static(path.resolve(__dirname, "../admin")));

  app.get("/health", (_req, res) => {
    const settings = deps.store.getSettings();
    const token = deps.store.getPosterAccessToken();
    res.json({
      ok: true,
      mode: config.sendpulseMode,
      publicBaseUrl: config.publicBaseUrl,
      webhookUrl: `${config.publicBaseUrl}/webhooks/poster`,
      adminUrl: `${config.publicBaseUrl}/admin`,
      posterAccessToken: token ? `${token.slice(0, 6)}…saved` : "missing",
      settings,
      jobs: deps.store.countByStatus(),
    });
  });

  app.post("/webhooks/poster", async (req, res) => {
    try {
      const payload = normalizePosterWebhookBody(req.body);
      if (!payload.account || !payload.object) {
        logger.warn("Poster webhook body missing account/object", {
          contentType: req.headers["content-type"],
          keys: req.body && typeof req.body === "object" ? Object.keys(req.body) : typeof req.body,
        });
      }
      const result = await deps.flow.handleWebhook(payload);
      logger.info("Poster webhook result", {
        action: result.action,
        details: result.details,
        accepted: result.accepted,
      });
      if (!result.accepted) {
        res.status(401).json({ status: "reject", ...result });
        return;
      }
      res.status(200).json({ status: "accept", ...result });
    } catch (error) {
      logger.error("Webhook handler error", { error: String(error) });
      res.status(500).json({ status: "error", message: String(error) });
    }
  });

  // Poster "Страница подключения" + OAuth redirect_uri
  app.get("/poster-connect", async (req, res) => {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const account = typeof req.query.account === "string" ? req.query.account : "";

    if (!code) {
      const startAccount =
        (typeof req.query.start_account === "string" && req.query.start_account) ||
        config.posterAccount ||
        "flesh2";
      res.redirect(getPosterAuthorizeUrl(startAccount));
      return;
    }

    try {
      const result = await exchangePosterAuthCode({ account, code });
      deps.store.savePosterAccessToken(result.access_token);
      logger.info("Saved Poster access_token from OAuth", {
        account: result.account,
        tokenPreview: `${result.access_token.slice(0, 6)}…`,
      });
      res
        .status(200)
        .type("html")
        .send(`<!doctype html><html><body style="font-family:sans-serif;padding:24px">
          <h1>Poster підключено</h1>
          <p>Access token збережено для акаунту <b>${escapeHtml(result.account)}</b>.</p>
          <p><a href="/admin">Відкрити адмінку</a></p>
          <p><a href="/health">Перевірити /health</a></p>
        </body></html>`);
    } catch (error) {
      logger.error("Poster OAuth connect failed", { error: String(error) });
      res
        .status(400)
        .type("html")
        .send(`<!doctype html><html><body style="font-family:sans-serif;padding:24px">
          <h1>Помилка підключення Poster</h1>
          <p>${escapeHtml(String(error))}</p>
          <p>Перевірте: oAuth увімкнено, Manage-платформа увімкнена,
          «Страница подключения» = <code>${escapeHtml(getPosterConnectUrl())}</code></p>
          <p><a href="/poster-connect?start_account=flesh2">Спробувати знову</a></p>
        </body></html>`);
    }
  });

  app.get("/admin/lang", (req, res) => {
    const lang = parseAdminLang(req.query.lang);
    req.session.lang = lang;
    res.setHeader(
      "Set-Cookie",
      `admin_lang=${lang}; Path=/; Max-Age=31536000; SameSite=Lax`,
    );
    const returnTo =
      typeof req.query.returnTo === "string" && req.query.returnTo.startsWith("/admin")
        ? req.query.returnTo
        : "/admin";
    res.redirect(returnTo);
  });

  app.get("/admin", (req, res) => {
    const lang = resolveAdminLang(req);
    if (!req.session.admin) {
      res.status(200).send(renderLoginPage({ lang }));
      return;
    }

    const settings = deps.store.getSettings();
    const stats = deps.store.getStats(settings.timezone);
    const view = parseStatsFilter(req.query.view);
    const jobs =
      view === "all"
        ? deps.store.listJobs(50)
        : deps.store.listJobsByFilter(view, settings.timezone, 200);

    res.status(200).send(
      renderDashboardPage({
        settings,
        stats,
        jobs,
        view,
        lang,
        posterAccessTokenSaved: Boolean(deps.store.getPosterAccessToken()),
        msg: typeof req.query.msg === "string" ? req.query.msg : undefined,
        err: typeof req.query.err === "string" ? req.query.err : undefined,
      }),
    );
  });

  app.post("/admin/login", (req, res) => {
    const lang = resolveAdminLang(req);
    const username = String(req.body.username ?? "");
    const password = String(req.body.password ?? "");
    if (username === config.adminUser && password === config.adminPassword) {
      req.session.admin = true;
      res.redirect("/admin");
      return;
    }
    res.status(401).send(renderLoginPage({ lang, error: t(lang, "badCredentials") }));
  });

  app.post("/admin/logout", (req, res) => {
    req.session.destroy(() => {
      res.redirect("/admin");
    });
  });

  app.post("/admin/settings", (req, res) => {
    const lang = resolveAdminLang(req);
    if (!req.session.admin) {
      res.status(401).send(renderLoginPage({ lang, error: t(lang, "loginRequired") }));
      return;
    }

    try {
      const settings = validateRuntimeSettings({
        delayHours: delayHoursFromParts(
          Number(req.body.delay_hours_part),
          Number(req.body.delay_minutes_part),
        ),
        quietEnabled: req.body.quiet_enabled === "1" || req.body.quiet_enabled === "on",
        quietStart: String(req.body.quiet_start ?? "00:00"),
        quietEnd: String(req.body.quiet_end ?? "09:00"),
        timezone: String(req.body.timezone ?? "Europe/Kyiv"),
      });
      deps.store.saveSettings(settings);
      res.redirect(`/admin?msg=${encodeURIComponent(t(lang, "settingsSaved"))}`);
    } catch (error) {
      res.redirect(`/admin?err=${encodeURIComponent(String(error))}`);
    }
  });

  app.post("/admin/poster-token", (req, res) => {
    const lang = resolveAdminLang(req);
    if (!req.session.admin) {
      res.status(401).send(renderLoginPage({ lang, error: t(lang, "loginRequired") }));
      return;
    }
    const token = String(req.body.poster_access_token ?? "").trim();
    if (!token) {
      res.redirect(`/admin?err=${encodeURIComponent(t(lang, "tokenRequired"))}`);
      return;
    }
    deps.store.savePosterAccessToken(token);
    res.redirect(`/admin?msg=${encodeURIComponent(t(lang, "tokenSaved"))}`);
  });

  app.get("/admin/jobs", (req, res) => {
    if (!authorizeApi(req)) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const settings = deps.store.getSettings();
    res.json({
      settings,
      jobs: deps.store.listJobs(200),
      counts: deps.store.countByStatus(),
      stats: deps.store.getStats(settings.timezone),
    });
  });

  /** Diagnose why a Poster order has no phone — calls Poster API with saved token. */
  app.get("/admin/debug/order/:orderId", async (req, res) => {
    if (!authorizeApi(req)) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const orderId = req.params.orderId;
    const object = String(req.query.object || "incoming_order");
    try {
      const [incoming, transaction, snapshot] = await Promise.all([
        deps.poster.getIncomingOrder(orderId).catch((error) => ({ error: String(error) })),
        deps.poster.getTransaction(orderId).catch((error) => ({ error: String(error) })),
        deps.poster.resolveOrderSnapshot({
          object,
          objectId: orderId,
          account: String(req.query.account || "flesh2"),
        }),
      ]);
      res.json({
        ok: true,
        object,
        orderId,
        tokenSaved: Boolean(deps.store.getPosterAccessToken()),
        incomingOrderApi: incoming,
        transactionApi: transaction,
        snapshot,
      });
    } catch (error) {
      res.status(500).json({ ok: false, error: String(error) });
    }
  });

  app.post("/admin/process-due", async (req, res) => {
    if (!authorizeApi(req)) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const result = await deps.flow.processDueJobs();
    res.json(result);
  });

  app.post("/admin/simulate", async (req, res) => {
    if (!authorizeApi(req)) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    const {
      account = "demo",
      orderId = "1001",
      status = "доставлено",
      phone = "+380501112233",
      email = "client@example.com",
      firstName = "Тест",
      lastName = "Клієнт",
      objectType = "incoming_order",
      action = "changed",
    } = req.body ?? {};

    const time = Math.floor(Date.now() / 1000);
    const data = {
      snapshot: {
        orderId: String(orderId),
        objectType,
        statusRaw: String(status),
        statusNormalized: normalizeStatus(status),
        phone,
        email,
        firstName,
        lastName,
        account,
      },
    };
    const unsigned = {
      account,
      account_number: "0",
      object: objectType,
      object_id: orderId,
      action,
      time,
      data,
    };
    const payload: PosterWebhookPayload = {
      ...unsigned,
      verify: buildPosterVerify(unsigned, config.posterApplicationSecret || "test-secret"),
    };

    const result = await deps.flow.handleWebhook(payload);
    res.json(result);
  });

  return app;
}

function authorizeApi(req: express.Request): boolean {
  if (req.session?.admin) return true;
  const header = req.headers["x-api-key"];
  const key = Array.isArray(header) ? header[0] : header;
  return Boolean(key && key === config.testApiKey);
}

function resolveAdminLang(req: express.Request): AdminLang {
  if (req.session?.lang === "uk" || req.session?.lang === "en") {
    return req.session.lang;
  }
  return langFromCookieHeader(req.headers.cookie) ?? "uk";
}

/** Poster may send JSON or form fields; `data` sometimes arrives as a JSON string. */
function normalizePosterWebhookBody(body: unknown): PosterWebhookPayload {
  const raw =
    typeof body === "string"
      ? (JSON.parse(body) as Record<string, unknown>)
      : body && typeof body === "object"
        ? (body as Record<string, unknown>)
        : {};

  let data = raw.data;
  if (typeof data === "string" && data.trim()) {
    try {
      data = JSON.parse(data);
    } catch {
      // keep string — signature verify uses the same stringified form
    }
  }

  return {
    account: String(raw.account ?? ""),
    account_number: raw.account_number as string | number | undefined,
    object: String(raw.object ?? ""),
    object_id: (raw.object_id ?? raw.objectId ?? "") as string | number,
    action: String(raw.action ?? ""),
    time: (raw.time ?? "") as string | number,
    verify: String(raw.verify ?? ""),
    data,
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function parseStatsFilter(value: unknown): StatsFilter {
  const allowed: StatsFilter[] = [
    "all",
    "pending",
    "sent_today",
    "cancelled",
    "deferred",
    "failed",
    "scheduled_today",
  ];
  const raw = typeof value === "string" ? value : "all";
  return allowed.includes(raw as StatsFilter) ? (raw as StatsFilter) : "all";
}
