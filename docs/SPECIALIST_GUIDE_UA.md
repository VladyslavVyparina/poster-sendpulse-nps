# Інструкція для спеціаліста: Poster ↔ SendPulse NPS

## 1. Навіщо цей сервіс

Після того як замовлення в **Poster** отримує статус **Доставлено / Завершено**, сервіс:

1. ставить відкладене завдання (затримка налаштовується в адмінці);
2. не відправляє SMS у «тихі» нічні години;
3. скасовує відправку, якщо до моменту SMS замовлення стало **Скасовано / Повернено**;
4. тригерить подію в **SendPulse Automation**, яка надсилає SMS клієнту.

Ланцюжок **не** стартує від простого додавання клієнта в Poster — лише від зміни статусу замовлення.

```
Poster (статус замовлення)
  → webhook на цей сервер
  → черга SQLite + затримка / quiet hours
  → SendPulse event poster_nps
  → SMS клієнту
```

## 2. Що має бути встановлено

- Node.js **18+**
- npm
- PM2 (`npm i -g pm2`)
- Відкритий порт **3000** (або ваш `PORT`) у firewall
- Акаунт Poster (застосунок для розробників) + акаунт SendPulse з SMS / Automation

Шлях на VPS (приклад): `/root/intagration_Poster_SendPulse_NPS`

## 3. Змінні середовища (`.env`)

Скопіюйте `.env.example` → `.env` і заповніть:

| Змінна | Призначення |
|--------|-------------|
| `PUBLIC_BASE_URL` | Публічна адреса сервера, напр. `http://IP:3000` |
| `POSTER_APPLICATION_ID` | Application Id застосунку Poster |
| `POSTER_APPLICATION_SECRET` | Application secret (підпис webhook + OAuth) |
| `POSTER_ACCESS_TOKEN` | Опційно; зазвичай зберігається через OAuth `/poster-connect` |
| `SENDPULSE_MODE` | `automation360` (рекомендовано) / `sms` / `dry-run` |
| `SENDPULSE_EVENT_URL` | POST URL події Automation (raw) |
| `ADMIN_USER` / `ADMIN_PASSWORD` | Вхід у `/admin` |
| `TEST_API_KEY` | Ключ для `/admin/simulate` і JSON API |
| `SESSION_SECRET` | Секрет сесії адмінки (змініть у проді) |

Access token Poster **не показується** в кабінеті Poster. Його отримують через OAuth (`/poster-connect`) або з webhook `application` при підключенні застосунку.

## 4. Налаштування Poster

У кабінеті розробника (застосунок Integration_NPS або аналог):

1. **oAuth** — увімкнути. Redirect URL:  
   `{PUBLIC_BASE_URL}/poster-connect`
2. **Manage-платформа** — увімкнути. URL iframe (опційно):  
   `{PUBLIC_BASE_URL}/admin`
3. **Вебхуки** — URL:  
   `{PUBLIC_BASE_URL}/webhooks/poster`  
   Сутності: `incoming_order`, `transaction`, `application` (і за потреби інші).
4. Зберегти налаштування.
5. Отримати access token: відкрити в браузері  
   `{PUBLIC_BASE_URL}/poster-connect?start_account=ВАШ_АКАУНТ`  
   і підтвердити доступ.
6. Перевірка: `curl -s http://127.0.0.1:3000/health`  
   має містити `"posterAccessToken":"……saved"`, не `"missing"`.

## 5. Налаштування SendPulse

1. Automation → Events / Менеджер подій → подія (напр. `poster_nps`).
2. Скопіювати **POST URL (raw)** у `SENDPULSE_EVENT_URL`.
3. Створити flow: тригер = ця подія → блок **SMS** → **запустити** flow.
4. У `.env`: `SENDPULSE_MODE=automation360`.
5. Ім’я відправника SMS (alpha-name) налаштовується в SendPulse. Якщо на телефоні видно інше ім’я (напр. SmsInfo) — це обмеження оператора/шлюзу, не цього middleware.

## 6. Запуск і робота у фоні (PM2)

```bash
cd /root/intagration_Poster_SendPulse_NPS
npm install          # лише якщо змінювались залежності; НЕ копіюйте node_modules з Mac
npm run build
pm2 start dist/index.js --name poster-nps
pm2 save
pm2 startup          # один раз — автозапуск після reboot
```

Корисні команди:

```bash
pm2 status
pm2 logs poster-nps
pm2 restart poster-nps --update-env
curl -s http://127.0.0.1:3000/health; echo
```

**Важливо:** `better-sqlite3` — нативний модуль. Після копіювання проєкту з macOS на Linux виконайте на сервері `rm -rf node_modules && npm install`.

## 7. Оновлення коду з локальної машини

З Mac (не копіювати `node_modules`, `data`, `.env`):

```bash
rsync -avz \
  --exclude node_modules \
  --exclude data \
  --exclude .env \
  --exclude .DS_Store \
  /Users/macbookpro/Desktop/intagration_Poster_SendPulse_NPS/ \
  root@SERVER_IP:~/intagration_Poster_SendPulse_NPS/
```

На сервері:

```bash
cd ~/intagration_Poster_SendPulse_NPS
npm run build
pm2 restart poster-nps --update-env
pm2 save
```

## 8. Адмін-панель

URL: `{PUBLIC_BASE_URL}/admin`

- статистика заявок NPS;
- затримка після доставки (окремий вибір годин 0–168 і хвилин 0–59);
- мова інтерфейсу: Укр / Eng;
- тихі години та часовий пояс;
- статус Poster access token;
- OAuth-лінк підключення Poster.

## 9. Тестова відправка собі

1. В адмінці поставте затримку **Одразу**, за потреби вимкніть тихі години.
2. На сервері:

```bash
cd ~/intagration_Poster_SendPulse_NPS

curl -s -X POST http://127.0.0.1:3000/admin/simulate \
  -H "Content-Type: application/json" \
  -H "x-api-key: ВАШ_TEST_API_KEY" \
  -d '{"account":"flesh2","orderId":"test-1","status":"доставлено","phone":"+380XXXXXXXXX","firstName":"Тест","lastName":"NPS"}'
echo

curl -s -X POST http://127.0.0.1:3000/admin/process-due \
  -H "x-api-key: ВАШ_TEST_API_KEY"
echo
```

Очікується `"sent":1` і SMS на вказаний номер (якщо flow у SendPulse активний).

## 10. Бойовий сценарій

1. Клієнт оформлює замовлення в Poster (з номером телефону).
2. Статус → **Доставлено / Завершено**.
3. Сервіс планує SMS через обрану затримку.
4. Якщо вночі — переносить на кінець тихого вікна.
5. Якщо скасовано/повернено до відправки — SMS не йде.
6. Інакше — подія в SendPulse → SMS.

## 11. Типові проблеми

| Симптом | Що перевірити |
|---------|----------------|
| `posterAccessToken: missing` | OAuth `/poster-connect`, `POSTER_APPLICATION_SECRET`, redirect URL |
| `Cannot GET /poster-connect` | На сервері стара збірка — `npm run build` + `pm2 restart` |
| `ERR_DLOPEN_FAILED` / invalid ELF | Переустановити `node_modules` на Linux |
| Trigger status but no phone | У замовленні немає телефону клієнта |
| Job `sent`, SMS немає | Flow SendPulse не запущений / немає SMS-блоку / баланс SMS |
| Відправник не бренд | Alpha-name у SendPulse / оператор (не middleware) |

## 12. Структура проєкту

```
src/                 — TypeScript код
admin/               — стилі адмінки
docs/                — ця інструкція
scripts/             — локальна симуляція
tests/               — unit/integration тести
.env.example         — шаблон конфігурації
```
