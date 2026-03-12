'use strict';

const { t } = require('../i18n');
const { buildCalendarKeyboard, buildHourKeyboard, hasAvailableSlots } = require('../keyboards');
const { getBookedHoursForDate, getBookedSlotsForMonth } = require('../db');

async function calendarCallbackHandler(ctx) {
  const data = ctx.callbackQuery.data;
  await ctx.answerCallbackQuery();

  const lang = ctx.session.lang || 'en';

  // Calendar navigation
  if (data.startsWith('cb:cal_prev:') || data.startsWith('cb:cal_next:')) {
    const parts = data.split(':');
    // format: cb:cal_prev:YYYY:MM or cb:cal_next:YYYY:MM
    const year = parseInt(parts[2]);
    const month = parseInt(parts[3]);

    ctx.session.calendarYear = year;
    ctx.session.calendarMonth = month;

    const bookedByDate = getBookedSlotsForMonth(year, month);
    await ctx.editMessageReplyMarkup({
      reply_markup: buildCalendarKeyboard(year, month, lang, bookedByDate),
    });
    return;
  }

  // Date selected
  if (data.startsWith('cb:cal_day:')) {
    const dateStr = data.slice('cb:cal_day:'.length);

    // Validate using UTC+5 today
    const nowUz = new Date(Date.now() + 5 * 60 * 60 * 1000);
    const y = nowUz.getUTCFullYear();
    const m = String(nowUz.getUTCMonth() + 1).padStart(2, '0');
    const d = String(nowUz.getUTCDate()).padStart(2, '0');
    const todayStr = `${y}-${m}-${d}`;
    const daysAhead = (parseInt(process.env.BOOKING_DAYS_AHEAD) || 7) - 1;
    const maxStr = new Date(new Date(`${todayStr}T00:00:00Z`).getTime() + daysAhead * 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 10);

    if (dateStr < todayStr || dateStr > maxStr) {
      await ctx.answerCallbackQuery({ text: t(lang, 'invalid_date'), show_alert: true });
      return;
    }

    const bookedHours = getBookedHoursForDate(dateStr);

    if (!hasAvailableSlots(dateStr, bookedHours)) {
      await ctx.answerCallbackQuery({ text: t(lang, 'invalid_date'), show_alert: true });
      return;
    }

    ctx.session.date = dateStr;
    ctx.session.step = 'STEP_HOUR';

    await ctx.editMessageText(t(lang, 'pick_hour'), {
      reply_markup: buildHourKeyboard(dateStr, lang, bookedHours),
    });
  }

  // Back to calendar from hour selection
  if (data === 'cb:hour_back') {
    ctx.session.step = 'STEP_DATE';
    ctx.session.date = null;
    const { calendarYear, calendarMonth } = ctx.session;
    const bookedByDate = getBookedSlotsForMonth(calendarYear, calendarMonth);
    await ctx.editMessageText(t(lang, 'pick_date'), {
      reply_markup: buildCalendarKeyboard(calendarYear, calendarMonth, lang, bookedByDate),
    });
  }
}

module.exports = { calendarCallbackHandler};
