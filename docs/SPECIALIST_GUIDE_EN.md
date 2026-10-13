# Specialist guide: Poster ↔ SendPulse NPS

## 1. Purpose

When an order in **Poster** reaches **Delivered / Completed**, this service:

1. schedules a delayed job (delay is configured in the admin UI);
2. does not send SMS during quiet overnight hours;
3. cancels the send if the order becomes **Cancelled / Returned** before send time;
4. triggers a **SendPulse Automation** event that sends the SMS.

The flow does **not** start when a customer is merely added to Poster — only when an order status changes to a trigger status.

```
Poster (order status)
  → webhook to this server
  → SQLite queue + delay / quiet hours
  → SendPulse event poster_nps
  → SMS to customer
```

## 2. Requirements

- Node.js **18+**
- npm
- PM2 (`npm i -g pm2`)
- Port **3000** (or your `PORT`) open in the firewall
- Poster developer application + SendPulse account with SMS / Automation

Example VPS path: `/root/intagration_Poster_SendPulse_NPS`

## 3. Environment (`.env`)

Copy `.env.example` → `.env` and fill in:

| Variable | Purpose |
|----------|---------|
| `PUBLIC_BASE_URL` | Public server URL, e.g. `http://IP:3000` |
| `POSTER_APPLICATION_ID` | Poster application id |
| `POSTER_APPLICATION_SECRET` | Application secret (webhook signature + OAuth) |
| `POSTER_ACCESS_TOKEN` | Optional; usually saved via OAuth `/poster-connect` |
| `SENDPULSE_MODE` | `automation360` (recommended) / `sms` / `dry-run` |
| `SENDPULSE_EVENT_URL` | Automation event POST URL (raw) |
| `ADMIN_USER` / `ADMIN_PASSWORD` | Login for `/admin` |
| `TEST_API_KEY` | Key for `/admin/simulate` and JSON API |
| `SESSION_SECRET` | Admin session secret (change in production) |

Poster access token is **not shown** in the Poster UI. Obtain it via OAuth (`/poster-connect`) or from the `application` webhook on app install.

## 4. Poster setup

In the Poster developer cabinet (app e.g. Integration_NPS):

1. Enable **oAuth**. Redirect URL:  
   `{PUBLIC_BASE_URL}/poster-connect`
2. Enable **Manage platform**. Optional iframe URL:  
   `{PUBLIC_BASE_URL}/admin`
3. **Webhooks** URL:  
   `{PUBLIC_BASE_URL}/webhooks/poster`  
   Entities: `incoming_order`, `transaction`, `application` (plus others if needed).
4. Save settings.
5. Get the access token: open  
   `{PUBLIC_BASE_URL}/poster-connect?start_account=YOUR_ACCOUNT`  
   and approve access.
6. Verify: `curl -s http://127.0.0.1:3000/health`  
   should show `"posterAccessToken":"……saved"`, not `"missing"`.

## 5. SendPulse setup

1. Automation → Events → create event (e.g. `poster_nps`).
2. Put the **POST URL (raw)** into `SENDPULSE_EVENT_URL`.
3. Create a flow: trigger = that event → **SMS** block → **launch** the flow.
4. In `.env`: `SENDPULSE_MODE=automation360`.
5. SMS sender (alpha-name) is configured in SendPulse. If the phone shows a generic name (e.g. SmsInfo), that is a carrier/gateway limitation, not this middleware.

## 6. Run in the background (PM2)

```bash
cd /root/intagration_Poster_SendPulse_NPS
npm install          # only if dependencies changed; do NOT copy node_modules from macOS
npm run build
pm2 start dist/index.js --name poster-nps
pm2 save
pm2 startup          # once — autostart after reboot
```

Useful commands:

```bash
pm2 status
pm2 logs poster-nps
pm2 restart poster-nps --update-env
curl -s http://127.0.0.1:3000/health; echo
```

**Important:** `better-sqlite3` is a native module. After copying the project from macOS to Linux, run `rm -rf node_modules && npm install` on the server.

## 7. Deploy updates from a local machine

From macOS (exclude `node_modules`, `data`, `.env`):

```bash
rsync -avz \
  --exclude node_modules \
  --exclude data \
  --exclude .env \
  --exclude .DS_Store \
  /Users/macbookpro/Desktop/intagration_Poster_SendPulse_NPS/ \
  root@SERVER_IP:~/intagration_Poster_SendPulse_NPS/
```

On the server:

```bash
cd ~/intagration_Poster_SendPulse_NPS
npm run build
pm2 restart poster-nps --update-env
pm2 save
```

## 8. Admin panel

URL: `{PUBLIC_BASE_URL}/admin`

- NPS job statistics;
- delay after delivery (separate hours 0–168 and minutes 0–59 selectors);
- UI language: Ukrainian / English;
- quiet hours and timezone;
- Poster access token status;
- OAuth connect link.

## 9. Test send to yourself

1. In admin, set delay to **Immediate**; disable quiet hours if needed.
2. On the server:

```bash
cd ~/intagration_Poster_SendPulse_NPS

curl -s -X POST http://127.0.0.1:3000/admin/simulate \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_TEST_API_KEY" \
  -d '{"account":"flesh2","orderId":"test-1","status":"доставлено","phone":"+380XXXXXXXXX","firstName":"Test","lastName":"NPS"}'
echo

curl -s -X POST http://127.0.0.1:3000/admin/process-due \
  -H "x-api-key: YOUR_TEST_API_KEY"
echo
```

Expect `"sent":1` and an SMS (if the SendPulse flow is active).

## 10. Production behaviour

1. Customer places an order in Poster (with a phone number).
2. Status → **Delivered / Completed**.
3. Service schedules SMS after the configured delay.
4. If that time falls in quiet hours — defer until quiet hours end.
5. If cancelled/returned before send — no SMS.
6. Otherwise — SendPulse event → SMS.

## 11. Common issues

| Symptom | Check |
|---------|--------|
| `posterAccessToken: missing` | OAuth `/poster-connect`, `POSTER_APPLICATION_SECRET`, redirect URL |
| `Cannot GET /poster-connect` | Stale build — `npm run build` + `pm2 restart` |
| `ERR_DLOPEN_FAILED` / invalid ELF | Reinstall `node_modules` on Linux |
| Trigger status but no phone | Order has no customer phone |
| Job `sent`, no SMS | Flow not launched / no SMS block / SMS balance |
| Wrong sender name | SendPulse alpha-name / carrier (not middleware) |

## 12. Project layout

```
src/                 — TypeScript source
admin/               — admin UI assets
docs/                — this guide
scripts/             — local simulation helper
tests/               — unit/integration tests
.env.example         — config template
```
