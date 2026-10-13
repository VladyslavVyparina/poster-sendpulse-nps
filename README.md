# Poster і SendPulse NPS

Проміжний сервіс між Poster POS і SendPulse: після виконаного замовлення відправляє NPS у SMS, враховує тихі години і скасування.

**Стек.** TypeScript, Node.js, Docker.

Публічний кейс. Робоча копія з паролями і базами лишається локально і сюди не входить.

---

# Poster ↔ SendPulse NPS

Middleware between **Poster POS** and **SendPulse**: after an order becomes delivered/completed, send a delayed NPS SMS (with cancel logic and quiet hours).

## Docs for specialists

- [Інструкція (українською)](docs/SPECIALIST_GUIDE_UA.md)
- [Guide (English)](docs/SPECIALIST_GUIDE_EN.md)

## Quick local start

```bash
cp .env.example .env
npm install
npm test
npm run build
npm start
```

- Health: `http://127.0.0.1:3000/health`
- Admin: `http://127.0.0.1:3000/admin`
- Webhook: `POST /webhooks/poster`
- OAuth connect: `GET /poster-connect`

Production on this project uses PM2 on the VPS (see specialist guide).
