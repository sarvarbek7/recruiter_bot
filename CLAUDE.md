# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Telegram bot for recruitment purposes, built with [Grammy](https://grammy.dev/) (Node.js Telegram Bot Framework). CommonJS module targeting Node.js >=14.

## Commands

```bash
node index.js          # Run the bot (entry point)
npm test               # No tests configured yet
```

No build or lint scripts are configured. Add them to `package.json` as needed.

## Environment Setup

Copy `env.example` to `.env` and fill in the Telegram Bot token:

```
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
ADMIN_IDS=123456789,987654321
SQLITE_DB_PATH=./recruiter_bot.db
LOCATION_LATITUDE=40.7128
LOCATION_LONGITUDE=-74.0060
BOOKING_DAYS_AHEAD=7
```

## Architecture

This is a skeleton project — only configuration files exist. The entry point is `index.js` (not yet created).

**Key dependency**: `grammy` v1.41.1 — the sole direct dependency, providing the Telegram Bot API client.

**Expected structure** when implementing:
- `index.js` — bot initialization, middleware registration, `bot.start()`
- Grammy uses `bot.command()`, `bot.on()`, `bot.hears()` for handling updates
- Long polling (`bot.start()`) or webhooks (`webhookCallback()`) for receiving updates
- i18n english(en), uzbek (uz), russian(ru)
## Requirements
- User starts the bot. Bot responsed welcome messages and choose language in all languages with 3 lang with their flag.
- After that bot asks user firstName, then lastName, then position name he/she wants apply.
- Then he/she choose date and hour when come interview. Date calendar (telegram buttons) min date today. Make sure choosen date must be greater than now.
- appointment saved in sqlite base and admins notified.
- admins can accept or reject appointment. the candidate (owner of appointment) must be notified
- admins can see appointments