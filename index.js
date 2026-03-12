'use strict';

require('dotenv').config();

const { Bot, session } = require('grammy');
const { initialSession } = require('./session');
const { startHandler } = require('./handlers/start');
const { flowCallbackHandler, flowTextHandler } = require('./handlers/flow');
const { calendarCallbackHandler } = require('./handlers/calendar');
const { adminListHandler, adminCalendarCallbackHandler, adminCallbackHandler } = require('./handlers/admin');
const { startScheduler } = require('./scheduler');

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('TELEGRAM_BOT_TOKEN is not set in .env');
  process.exit(1);
}

const bot = new Bot(token);

// Session middleware
bot.use(session({ initial: initialSession }));

// Commands
bot.command('start', startHandler);
bot.command('appointments', adminListHandler);

// Callback queries
bot.callbackQuery(/^cb:lang:/, flowCallbackHandler);
bot.callbackQuery(/^cb:cal_/, calendarCallbackHandler);
bot.callbackQuery('cb:hour_back', calendarCallbackHandler);
bot.callbackQuery(/^cb:hour:/, flowCallbackHandler);
bot.callbackQuery(/^cb:admin_cal_/, adminCalendarCallbackHandler);
bot.callbackQuery(/^cb:admin_accept:/, adminCallbackHandler);
bot.callbackQuery(/^cb:admin_reject:/, adminCallbackHandler);
bot.callbackQuery('cb:noop', ctx => ctx.answerCallbackQuery());

// Text messages (conversation flow)
bot.on('message:text', flowTextHandler);

// Global error handler
bot.catch(err => {
  console.error('Bot error:', err);
});

startScheduler(bot);
bot.start();
console.log('Bot is running...');
