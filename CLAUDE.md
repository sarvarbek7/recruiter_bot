# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install   # Install dependencies
npm start     # Run the bot (node index.js)
```

No test suite is configured.

## Architecture

This is a Telegram bot for scheduling recruitment interviews. Built with [grammY](https://grammy.dev/) (Telegram bot framework), better-sqlite3, node-cron, and exceljs.

### Request flow

1. **Candidates** interact through a multi-step booking flow: language selection → name/position collection → calendar date picker → time slot selection → phone number → confirmation.
2. **Admins** receive notifications for each new appointment and can Accept ✅ or Reject ❌. Accepted candidates get a confirmation + GPS location; rejected candidates get a rejection notice. Other admins are notified of the action taken.
3. **Scheduler** (Asia/Tashkent, UTC+5): sends a daily Excel report to all admins at 09:00, and deletes unreviewed pending appointments at 19:00 with admin notification.

### Key modules

| File | Responsibility |
|------|---------------|
| `index.js` | Bot setup, middleware wiring, handler registration |
| `db.js` | All SQLite queries (appointments, admins, admin_messages tables) |
| `session.js` | Grammy session shape — tracks per-user conversation state |
| `keyboards.js` | All inline keyboard builders (calendar, time slots, language, etc.) |
| `handlers/start.js` | `/start` command, language selection |
| `handlers/flow.js` | Text/callback handlers for the candidate booking flow |
| `handlers/calendar.js` | Calendar pagination callbacks |
| `handlers/admin.js` | Admin commands (`/appointments`, `/add_admin`, `/remove_admin`, `/list_admins`) and appointment approval callbacks |
| `scheduler.js` | node-cron jobs for daily report and cleanup |
| `excel.js` | ExcelJS report generation |
| `i18n.js` | Translation loader; messages live in `i18n/{en,uz,ru}/messages.json` |

### Admin management

Admin IDs are stored in both the `admins` DB table and the `ADMIN_IDS` env variable. On startup, `db.js` syncs the env list into the DB. Runtime changes via `/add_admin` / `/remove_admin` update only the DB; the env variable is the seed source.

### Environment variables (see `env.example`)

| Variable | Purpose |
|----------|---------|
| `TELEGRAM_BOT_TOKEN` | Bot token from BotFather |
| `ADMIN_IDS` | Comma-separated seed admin Telegram IDs |
| `SQLITE_DB_PATH` | Path to SQLite file (default `./recruiter_bot.db`) |
| `LOCATION_LATITUDE` / `LOCATION_LONGITUDE` | Interview venue coordinates sent to accepted candidates |
| `BOOKING_DAYS_AHEAD` | How many days ahead candidates can book |
| `WORKING_HOURS` | Comma-separated time ranges, e.g. `10:00-12:00,14:00-17:00` |
| `SLOT_DURATION_MINUTES` | Duration of each interview slot in minutes |

All date/time logic assumes **Asia/Tashkent (UTC+5)** timezone.
