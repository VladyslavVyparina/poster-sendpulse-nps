# Poster to SendPulse NPS

A small service between Poster point of sale and SendPulse. When an order is delivered, it waits, then sends one NPS text message, and it cancels that message if the order should no longer be surveyed.

## Problem

Asking for a score at the moment of payment is too early, and asking at a random hour gets ignored. Poster knows when the order is actually finished. SendPulse is what the restaurant already uses to text guests. Nothing in the middle was delaying the question, skipping quiet hours, or cancelling it when the order was voided.

## What was built

- A webhook Poster calls when an order changes.
- A delay before the NPS SMS, so the guest is not interrupted at the counter.
- Quiet hours: the send moves out of the blocked window.
- Cancel logic when a later Poster event means the survey should not go out.
- An admin page and a health check.
- OAuth connect so the Poster account is linked once (`GET /poster-connect`).

Specialist guides ship in `docs/` in Ukrainian and English.

## How it works

`POST /webhooks/poster` is the only event entry. The service records the order, schedules the SMS, and drops the job if a newer event cancels it. SendPulse sends the message. The admin UI is for checking what is queued. Production on the original project used PM2; `ecosystem.config.cjs` and the Docker file are in the tree for either style of run.

## Stack

TypeScript, Node.js, Docker, Poster API, SendPulse.

## Run locally

```bash
cp .env.example .env
npm install
npm test
npm run build
npm start
```

Health: `http://127.0.0.1:3000/health`. Admin: `http://127.0.0.1:3000/admin`.

## What this public copy leaves out

`.env` and `node_modules`.
