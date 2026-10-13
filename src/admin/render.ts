import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { JobStats, StatsFilter } from "../db/database.js";
import { config } from "../config.js";
import type { RuntimeSettings } from "../settings/runtime.js";
import type { NpsJob } from "../types.js";
import {
  type AdminLang,
  delayPartsFromHours,
  delaySelectOptions,
  t,
} from "./i18n.js";
import { timezoneSelectHtml } from "./timezones.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const designSystemPath = path.resolve(__dirname, "../../admin/_design_system.html");

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatDt(ms: number, timeZone: string, lang: AdminLang): string {
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "uk-UA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(ms));
}

function statusBadge(status: string, lang: AdminLang): string {
  const map: Record<string, string> = {
    pending: "badge-warning",
    sent: "badge-success",
    cancelled: "badge-danger",
    failed: "badge-danger",
    skipped: "badge-info",
  };
  const labels: Record<string, string> = {
    pending: t(lang, "statusPending"),
    sent: t(lang, "statusSent"),
    cancelled: t(lang, "statusCancelled"),
    failed: t(lang, "statusFailed"),
    skipped: t(lang, "statusSkipped"),
  };
  return `<span class="badge ${map[status] ?? "badge-info"}">${escapeHtml(labels[status] ?? status)}</span>`;
}

function prettyPayload(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function viewLabel(view: StatsFilter, lang: AdminLang): string {
  const map: Record<StatsFilter, string> = {
    all: t(lang, "viewAll"),
    pending: t(lang, "viewPending"),
    sent_today: t(lang, "viewSentToday"),
    cancelled: t(lang, "viewCancelled"),
    deferred: t(lang, "viewDeferred"),
    failed: t(lang, "viewFailed"),
    scheduled_today: t(lang, "viewScheduledToday"),
  };
  return map[view];
}

function langSwitcher(lang: AdminLang, returnTo = "/admin"): string {
  const ukActive = lang === "uk" ? " is-active" : "";
  const enActive = lang === "en" ? " is-active" : "";
  const ret = encodeURIComponent(returnTo);
  return `<div class="lang-switch" role="group" aria-label="Language">
    <a class="lang-btn${ukActive}" href="/admin/lang?lang=uk&returnTo=${ret}">Укр</a>
    <a class="lang-btn${enActive}" href="/admin/lang?lang=en&returnTo=${ret}">Eng</a>
  </div>`;
}

const sharedStyles = `
    .job-detail {
      background: var(--bg-input);
      border: 1px solid var(--border-color);
      border-radius: var(--radius);
      padding: 12px;
      margin: 4px 0 8px;
    }
    .job-payload {
      margin: 0;
      max-height: 280px;
      overflow: auto;
      font-family: var(--font-mono);
      font-size: 0.75rem;
      white-space: pre-wrap;
      word-break: break-word;
      color: var(--text-primary);
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius);
      padding: 10px;
    }
    .job-row.is-open { background: var(--bg-hover); }
    .job-expand-btn i, .job-expand-btn svg { transition: transform .15s ease; }
    .job-row.is-open .job-expand-btn i,
    .job-row.is-open .job-expand-btn svg { transform: rotate(90deg); }
    .table-wrap.jobs-table { max-height: none; }
    .flash-banner { transition: opacity .25s ease; }
    .flash-banner.is-hiding { opacity: 0; }
    a.stat-card-link { text-decoration: none; color: inherit; display: block; }
    a.stat-card-link:hover { border-color: var(--color-primary-border); }
    a.stat-card-link.is-active {
      border-color: var(--color-primary);
      box-shadow: 0 0 0 1px var(--color-primary-border);
    }
    a.stat-card-link.is-active::before { opacity: 1; }
    .creds-list { display: flex; flex-direction: column; gap: 10px; }
    .cred-item {
      border: 1px solid var(--border-color);
      border-radius: var(--radius);
      padding: 10px 12px;
      background: var(--bg-input);
    }
    .cred-item strong { display: block; margin-bottom: 4px; font-family: var(--font-display); }
    .lang-switch { display: inline-flex; gap: 4px; align-items: center; }
    .lang-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 40px;
      padding: 6px 10px;
      border-radius: 8px;
      border: 1px solid var(--border-color);
      color: var(--text-secondary);
      text-decoration: none;
      font-size: 0.8rem;
      font-weight: 600;
      background: var(--bg-card);
    }
    .lang-btn.is-active {
      color: var(--text-primary);
      border-color: var(--color-primary);
      background: var(--color-primary-soft, var(--bg-hover));
    }
    .delay-pick {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .delay-pick .form-row { margin: 0; }
`;

export function renderLoginPage(opts: { error?: string; lang?: AdminLang } = {}): string {
  const lang = opts.lang ?? "uk";
  const design = fs.readFileSync(designSystemPath, "utf8");
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(t(lang, "loginTitle"))}</title>
  ${design}
  <style>${sharedStyles}</style>
</head>
<body>
  <div class="cb-login-shell">
    <div class="cb-login-card">
      <div class="cb-login-content">
        <div style="display:flex;justify-content:flex-end;margin-bottom:12px">
          ${langSwitcher(lang, "/admin")}
        </div>
        <div class="header">
          <h1>${escapeHtml(t(lang, "loginHeading"))}</h1>
          <p>${escapeHtml(t(lang, "loginSub"))}</p>
        </div>
        ${opts.error ? `<div class="err">${escapeHtml(opts.error)}</div>` : ""}
        <form method="post" action="/admin/login">
          <div class="form-row">
            <label for="username">${escapeHtml(t(lang, "username"))}</label>
            <input id="username" name="username" type="text" required autocomplete="username" />
          </div>
          <div class="form-row">
            <label for="password">${escapeHtml(t(lang, "password"))}</label>
            <input id="password" name="password" type="password" required autocomplete="current-password" />
          </div>
          <div class="btn-row">
            <button class="btn btn-primary" type="submit">${escapeHtml(t(lang, "signIn"))}</button>
          </div>
        </form>
      </div>
    </div>
  </div>
  <script>if (window.lucide) lucide.createIcons();</script>
</body>
</html>`;
}

export function renderDashboardPage(opts: {
  settings: RuntimeSettings;
  stats: JobStats;
  jobs: NpsJob[];
  view?: StatsFilter;
  lang?: AdminLang;
  posterAccessTokenSaved?: boolean;
  msg?: string;
  err?: string;
}): string {
  const lang = opts.lang ?? "uk";
  const design = fs.readFileSync(designSystemPath, "utf8");
  const view: StatsFilter = opts.view ?? "all";
  const label = viewLabel(view, lang);
  const delay = delayPartsFromHours(opts.settings.delayHours);
  const connectUrl = `${config.publicBaseUrl}/poster-connect`;
  const webhookUrl = `${config.publicBaseUrl}/webhooks/poster`;

  const rows = opts.jobs
    .map((job) => {
      const detailId = `job-detail-${job.id}`;
      return `
      <tr class="job-row" data-job-toggle="${detailId}" style="cursor:pointer">
        <td>
          <button type="button" class="btn btn-small btn-ghost job-expand-btn" data-job-toggle="${detailId}" aria-expanded="false">
            <i data-lucide="chevron-right"></i>
          </button>
          ${job.id}
        </td>
        <td><code>${escapeHtml(job.order_id)}</code></td>
        <td>${escapeHtml(job.phone ?? "—")}</td>
        <td>${statusBadge(job.job_status, lang)}</td>
        <td class="mono text-xs">${escapeHtml(formatDt(job.run_at, opts.settings.timezone, lang))}</td>
        <td class="mono text-xs">${escapeHtml(formatDt(job.created_at, opts.settings.timezone, lang))}</td>
        <td class="text-xs text-muted">${escapeHtml(job.last_error ?? "—")}</td>
      </tr>
      <tr id="${detailId}" class="job-detail-row" hidden>
        <td colspan="7">
          <div class="job-detail">
            <div class="form-grid" style="margin-bottom:10px">
              <div><span class="hint">${escapeHtml(t(lang, "type"))}</span><div><code>${escapeHtml(job.object_type)}</code></div></div>
              <div><span class="hint">${escapeHtml(t(lang, "account"))}</span><div><code>${escapeHtml(job.account)}</code></div></div>
              <div><span class="hint">${escapeHtml(t(lang, "client"))}</span><div>${escapeHtml(job.customer_name ?? "—")}</div></div>
              <div><span class="hint">${escapeHtml(t(lang, "email"))}</span><div>${escapeHtml(job.email ?? "—")}</div></div>
              <div><span class="hint">${escapeHtml(t(lang, "statusAtSchedule"))}</span><div>${escapeHtml(job.status_at_schedule)}</div></div>
              <div><span class="hint">${escapeHtml(t(lang, "updated"))}</span><div class="mono text-xs">${escapeHtml(formatDt(job.updated_at, opts.settings.timezone, lang))}</div></div>
            </div>
            <div class="hint" style="margin-bottom:6px">${escapeHtml(t(lang, "payload"))}</div>
            <pre class="job-payload">${escapeHtml(prettyPayload(job.payload_json))}</pre>
          </div>
        </td>
      </tr>`;
    })
    .join("");

  const statCard = (
    key: StatsFilter,
    title: string,
    value: number,
    sub: string,
    color?: string,
  ) => {
    const active = view === key ? " is-active" : "";
    const colorStyle = color ? ` style="color:${color}"` : "";
    return `<a class="stat-card stat-card-link${active}" href="/admin?view=${key}">
      <div class="cb-stat-label">${title}</div>
      <div class="cb-stat-value"${colorStyle}>${value}</div>
      <div class="cb-stat-sub">${sub}</div>
    </a>`;
  };

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(t(lang, "brandTitle"))}</title>
  ${design}
  <style>${sharedStyles}</style>
</head>
<body>
  <div class="cb-app">
    <aside class="cb-sidebar">
      <div class="cb-sidebar-brand">
        <div class="cb-brand-icon">F</div>
        <div class="cb-brand-text">
          <div class="cb-brand-title">${escapeHtml(t(lang, "brandTitle"))}</div>
          <div class="cb-brand-sub">${escapeHtml(t(lang, "brandSub"))}</div>
        </div>
      </div>
      <nav class="cb-sidebar-nav">
        <div class="cb-nav-section">${escapeHtml(t(lang, "panel"))}</div>
        <a class="cb-nav-item active" href="/admin"><i data-lucide="layout-dashboard"></i> ${escapeHtml(t(lang, "dashboard"))}</a>
      </nav>
      <div class="cb-sidebar-footer">
        <form method="post" action="/admin/logout" style="width:100%">
          <button class="btn btn-ghost w-full" type="submit"><i data-lucide="log-out"></i> ${escapeHtml(t(lang, "logout"))}</button>
        </form>
      </div>
    </aside>
    <div class="cb-main">
      <div class="cb-topbar">
        <div class="cb-topbar-title">${escapeHtml(t(lang, "topbarTitle"))}</div>
        <div class="cb-topbar-actions" style="display:flex;gap:10px;align-items:center">
          ${langSwitcher(lang, view === "all" ? "/admin" : `/admin?view=${view}`)}
          <button type="button" class="cb-theme-toggle" id="cb-theme-toggle" title="${escapeHtml(t(lang, "themeToggle"))}">
            <svg class="cb-icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
            <svg class="cb-icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          </button>
        </div>
      </div>
      <div class="cb-content">
        <div class="cb-wrap">
          ${opts.msg ? `<div class="ok flash-banner" id="flash-msg" data-flash>${escapeHtml(opts.msg)}</div>` : ""}
          ${opts.err ? `<div class="err flash-banner" id="flash-err" data-flash>${escapeHtml(opts.err)}</div>` : ""}

          <div class="stats-grid">
            ${statCard("pending", t(lang, "statPending"), opts.stats.pending, t(lang, "statPendingSub"), "var(--color-warning)")}
            ${statCard("sent_today", t(lang, "statSentToday"), opts.stats.sentToday, `${t(lang, "statSentSub")}: ${opts.stats.sent}`, "var(--color-success)")}
            ${statCard("cancelled", t(lang, "statCancelled"), opts.stats.cancelled, t(lang, "statCancelledSub"), "var(--color-danger)")}
            ${statCard("deferred", t(lang, "statDeferred"), opts.stats.deferredPending, t(lang, "statDeferredSub"), "var(--color-info)")}
            ${statCard("failed", t(lang, "statFailed"), opts.stats.failed, t(lang, "statFailedSub"))}
            ${statCard("scheduled_today", t(lang, "statScheduled"), opts.stats.scheduledToday, t(lang, "statScheduledSub"))}
          </div>

          <div class="card">
            <div class="cb-card-header">
              <div class="cb-card-title"><i data-lucide="clock"></i> ${escapeHtml(t(lang, "settingsTitle"))}</div>
            </div>
            <form method="post" action="/admin/settings">
              <div class="form-grid">
                <div class="form-row" style="grid-column:1 / -1">
                  <label>${escapeHtml(t(lang, "delayLabel"))}</label>
                  <div class="delay-pick">
                    <div class="form-row">
                      <label for="delay_hours_part">${escapeHtml(t(lang, "hours"))}</label>
                      <select id="delay_hours_part" name="delay_hours_part" required>
                        ${delaySelectOptions(168, delay.hours)}
                      </select>
                    </div>
                    <div class="form-row">
                      <label for="delay_minutes_part">${escapeHtml(t(lang, "minutes"))}</label>
                      <select id="delay_minutes_part" name="delay_minutes_part" required>
                        ${delaySelectOptions(59, delay.minutes)}
                      </select>
                    </div>
                  </div>
                  <p class="hint">${escapeHtml(t(lang, "delayHint"))}</p>
                </div>
                <div class="form-row">
                  <label for="timezone">${escapeHtml(t(lang, "timezone"))}</label>
                  <select id="timezone" name="timezone" required>
                    ${timezoneSelectHtml(opts.settings.timezone)}
                  </select>
                  <p class="hint">${escapeHtml(t(lang, "timezoneHint"))}</p>
                </div>
                <div class="form-row">
                  <label for="quiet_start">${escapeHtml(t(lang, "quietFrom"))}</label>
                  <input id="quiet_start" name="quiet_start" type="time" value="${escapeHtml(opts.settings.quietStart)}" required />
                </div>
                <div class="form-row">
                  <label for="quiet_end">${escapeHtml(t(lang, "quietTo"))}</label>
                  <input id="quiet_end" name="quiet_end" type="time" value="${escapeHtml(opts.settings.quietEnd)}" required />
                  <p class="hint">${escapeHtml(t(lang, "quietHint"))}</p>
                </div>
              </div>
              <div class="form-row">
                <label>
                  <input type="checkbox" name="quiet_enabled" value="1" ${opts.settings.quietEnabled ? "checked" : ""} />
                  ${escapeHtml(t(lang, "quietEnabled"))}
                </label>
              </div>
              <div class="btn-row">
                <button class="btn btn-green" type="submit">${escapeHtml(t(lang, "saveSettings"))}</button>
              </div>
            </form>
          </div>

          <div class="card" id="jobs-section">
            <div class="cb-card-header">
              <div class="cb-card-title"><i data-lucide="list"></i> ${escapeHtml(label)} <span class="hint">· ${opts.jobs.length}</span></div>
              ${
                view !== "all"
                  ? `<a class="btn btn-small btn-ghost" href="/admin">${escapeHtml(t(lang, "showAll"))}</a>`
                  : ""
              }
            </div>
            <p class="hint" style="margin-bottom:8px">
              ${escapeHtml(view === "all" ? t(lang, "jobsHintAll") : t(lang, "jobsHintFiltered"))}
            </p>
            <div class="table-wrap jobs-table">
              <table>
                <thead>
                  <tr>
                    <th>${escapeHtml(t(lang, "colId"))}</th>
                    <th>${escapeHtml(t(lang, "colOrder"))}</th>
                    <th>${escapeHtml(t(lang, "colPhone"))}</th>
                    <th>${escapeHtml(t(lang, "colStatus"))}</th>
                    <th>${escapeHtml(t(lang, "colSend"))}</th>
                    <th>${escapeHtml(t(lang, "colCreated"))}</th>
                    <th>${escapeHtml(t(lang, "colNote"))}</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows || `<tr><td colspan="7">${escapeHtml(t(lang, "emptyJobs"))}</td></tr>`}
                </tbody>
              </table>
            </div>
          </div>

          <div class="card">
            <div class="cb-card-header">
              <div class="cb-card-title"><i data-lucide="key-round"></i> ${escapeHtml(t(lang, "tokenTitle"))}</div>
            </div>
            <p>
              ${escapeHtml(t(lang, "status"))}:
              ${
                opts.posterAccessTokenSaved
                  ? `<span class="badge badge-success">${escapeHtml(t(lang, "tokenSavedBadge"))}</span>`
                  : `<span class="badge badge-danger">${escapeHtml(t(lang, "tokenMissingBadge"))}</span>`
              }
            </p>
            <p class="hint">${escapeHtml(t(lang, "tokenHint"))}</p>
            <ol class="hint" style="margin:8px 0 12px 18px;padding:0">
              <li>${escapeHtml(t(lang, "tokenStep1"))}</li>
              <li>${escapeHtml(t(lang, "tokenStep2"))} <code>${escapeHtml(connectUrl)}</code></li>
              <li>${escapeHtml(t(lang, "tokenStep3"))}</li>
            </ol>
            <div class="btn-row" style="margin-bottom:14px">
              <a class="btn btn-green" href="/poster-connect?start_account=flesh2">${escapeHtml(t(lang, "connectPoster"))}</a>
            </div>
            <form method="post" action="/admin/poster-token">
              <div class="form-row">
                <label for="poster_access_token">${escapeHtml(t(lang, "pasteToken"))}</label>
                <input id="poster_access_token" name="poster_access_token" type="text" placeholder="access token" autocomplete="off" />
              </div>
              <div class="btn-row">
                <button class="btn btn-green" type="submit">${escapeHtml(t(lang, "saveToken"))}</button>
              </div>
            </form>
          </div>

          <div class="card">
            <div class="cb-card-header">
              <div class="cb-card-title"><i data-lucide="book-key"></i> ${escapeHtml(t(lang, "credsTitle"))}</div>
            </div>
            <div class="creds-list">
              <div class="cred-item">
                <strong>POSTER_APPLICATION_SECRET</strong>
                <p class="hint">${escapeHtml(t(lang, "secretHint"))}</p>
                <p>${escapeHtml(t(lang, "secretWhere"))}</p>
              </div>
              <div class="cred-item">
                <strong>POSTER_ACCESS_TOKEN</strong>
                <p class="hint">${escapeHtml(t(lang, "accessHint"))}</p>
              </div>
              <div class="cred-item">
                <strong>SENDPULSE_EVENT_URL</strong>
                <p class="hint">${escapeHtml(t(lang, "eventHint"))}</p>
              </div>
              <div class="cred-item">
                <strong>${escapeHtml(t(lang, "webhookTitle"))}</strong>
                <p><code>${escapeHtml(webhookUrl)}</code></p>
                <p class="hint">${escapeHtml(t(lang, "webhookEntities"))}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <script>
    if (window.lucide) lucide.createIcons();

    (function() {
      var flashes = document.querySelectorAll('[data-flash]');
      var view = ${JSON.stringify(view)};
      var cleanUrl = view && view !== 'all' ? '/admin?view=' + encodeURIComponent(view) : '/admin';
      if (flashes.length && window.history && window.history.replaceState) {
        window.history.replaceState({}, document.title, cleanUrl);
      }
      if (!flashes.length) return;
      setTimeout(function() {
        flashes.forEach(function(el) {
          el.classList.add('is-hiding');
          setTimeout(function() { el.remove(); }, 280);
        });
      }, 2800);
    })();

    (function() {
      var view = ${JSON.stringify(view)};
      if (view && view !== 'all') {
        var section = document.getElementById('jobs-section');
        if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    })();

    document.addEventListener('click', function(e) {
      var target = e.target;
      if (!(target instanceof Element)) return;
      var toggle = target.closest('[data-job-toggle]');
      if (!toggle) return;
      e.preventDefault();
      var id = toggle.getAttribute('data-job-toggle');
      if (!id) return;
      var detail = document.getElementById(id);
      var row = document.querySelector('tr.job-row[data-job-toggle=\"' + id + '\"]');
      if (!detail || !row) return;
      var open = detail.hasAttribute('hidden');
      detail.hidden = !open;
      row.classList.toggle('is-open', open);
      var btn = row.querySelector('.job-expand-btn');
      if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  </script>
</body>
</html>`;
}
