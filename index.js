'use strict';

require('dotenv').config();

const { Bot, session } = require('grammy');
const { initialSession } = require('./session');
const { syncAdminsFromEnv } = require('./db');
const { startHandler } = require('./handlers/start');
const { flowCallbackHandler, flowTextHandler } = require('./handlers/flow');
const { calendarCallbackHandler } = require('./handlers/calendar');
const {
  adminListHandler, adminCalendarCallbackHandler, adminCallbackHandler,
  addAdminHandler, removeAdminHandler, listAdminsHandler, adminTextHandler,
} = require('./handlers/admin');
const { startScheduler } = require('./scheduler');

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('TELEGRAM_BOT_TOKEN is not set in .env');
  process.exit(1);
}

// Seed admin IDs from env into DB on startup
syncAdminsFromEnv();

const bot = new Bot(token);

// Session middleware
bot.use(session({ initial: initialSession }));

// Commands
bot.command('start', startHandler);
bot.command('appointments', adminListHandler);
bot.command('add_admin', addAdminHandler);
bot.command('remove_admin', removeAdminHandler);
bot.command('list_admins', listAdminsHandler);

// Callback queries
bot.callbackQuery(/^cb:lang:/, flowCallbackHandler);
bot.callbackQuery(/^cb:cal_/, calendarCallbackHandler);
bot.callbackQuery('cb:hour_back', calendarCallbackHandler);
bot.callbackQuery(/^cb:hour:/, flowCallbackHandler);
bot.callbackQuery(/^cb:admin_cal_/, adminCalendarCallbackHandler);
bot.callbackQuery(/^cb:admin_accept:/, adminCallbackHandler);
bot.callbackQuery(/^cb:admin_reject:/, adminCallbackHandler);
bot.callbackQuery('cb:noop', ctx => ctx.answerCallbackQuery());

// Text messages — admin prompts take priority, then user booking flow
bot.on('message:text', adminTextHandler, flowTextHandler);

// Global error handler
bot.catch(err => {
  console.error('Bot error:', err);
});

startScheduler(bot);
bot.start();
console.log('Bot is running...');
