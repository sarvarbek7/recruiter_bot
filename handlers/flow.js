'use strict';

const { t } = require('../i18n');
const { buildCalendarKeyboard, buildHourKeyboard, removeKeyboard } = require('../keyboards');
const { createAppointment, isSlotTaken, getBookedSlotsForMonth, saveAdminMessage } = require('../db');

/**
 * Handle language selection and hour selection callback queries.
 */
async function flowCallbackHandler(ctx) {
  const data = ctx.callbackQuery.data;
  await ctx.answerCallbackQuery();

  // Language selection
  if (data.startsWith('cb:lang:')) {
    const lang = data.split(':')[2];
    ctx.session.lang = lang;
    ctx.session.step = 'STEP_FIRST_NAME';
    await ctx.editMessageText(t(lang, 'ask_first_name'), { reply_markup: { inline_keyboard: [] } });
    return;
  }

  // Hour selection — store hour, ask for phone number
  if (data.startsWith('cb:hour:')) {
    const hour = data.slice('cb:hour:'.length);
    ctx.session.hour = hour;
    ctx.session.step = 'STEP_PHONE';

    const lang = ctx.session.lang;
    await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } });
    await ctx.reply(t(lang, 'ask_phone'), { reply_markup: removeKeyboard() });
    return;
  }
}

/**
 * Handle text messages for the conversation steps.
 */
async function flowTextHandler(ctx) {
  const { step, lang } = ctx.session;

  if (step === 'STEP_LANG') {
    // Still waiting for language selection via inline button — ignore text
    await ctx.reply(t('en', 'welcome'), { reply_markup: require('../keyboards').buildLangKeyboard() });
    return;
  }

  if (step === 'STEP_FIRST_NAME') {
    ctx.session.firstName = ctx.message.text.trim();
    ctx.session.step = 'STEP_LAST_NAME';
    await ctx.reply(t(lang, 'ask_last_name'));
    return;
  }

  if (step === 'STEP_LAST_NAME') {
    ctx.session.lastName = ctx.message.text.trim();
    ctx.session.step = 'STEP_POSITION';
    await ctx.reply(t(lang, 'ask_position'));
    return;
  }

  if (step === 'STEP_POSITION') {
    ctx.session.position = ctx.message.text.trim();
    ctx.session.step = 'STEP_DATE';
    const { calendarYear, calendarMonth } = ctx.session;
    const bookedByDate = getBookedSlotsForMonth(calendarYear, calendarMonth);
    await ctx.reply(t(lang, 'pick_date'), {
      reply_markup: buildCalendarKeyboard(calendarYear, calendarMonth, lang, bookedByDate),
    });
    return;
  }

  if (step === 'STEP_DATE' || step === 'STEP_HOUR') {
    // Ignore plain text while waiting for inline button selections
    return;
  }

  if (step === 'STEP_PHONE') {
    const phone = ctx.message.text.trim();
    const { date, hour, firstName, lastName, position } = ctx.session;

    if (isSlotTaken(date, hour)) {
      ctx.session.step = 'STEP_DATE';
      ctx.session.date = null;
      ctx.session.hour = null;
      const { calendarYear, calendarMonth } = ctx.session;
      const bookedByDate = getBookedSlotsForMonth(calendarYear, calendarMonth);
      await ctx.reply(
        t(lang, 'slot_taken', { date, hour }),
        { reply_markup: buildCalendarKeyboard(calendarYear, calendarMonth, lang, bookedByDate) }
      );
      return;
    }

    const appointmentId = createAppointment({
      user_id: ctx.from.id,
      username: ctx.from.username ? `@${ctx.from.username}` : 'N/A',
      first_name: firstName,
      last_name: lastName,
      position,
      date,
      hour,
      phone,
      lang,
    });

    ctx.session.step = 'STEP_DONE';

    const name = `${firstName} ${lastName}`;
    await ctx.reply(
      t(lang, 'appointment_confirmed', { name, position, date, hour }),
      { reply_markup: removeKeyboard() }
    );

    await notifyAdmins(ctx, { id: appointmentId, name, position, date, hour, phone });
    return;
  }

  if (step === 'STEP_DONE') {
    await ctx.reply(t(lang || 'en', 'error_generic'));
  }
}

async function notifyAdmins(ctx, { id, name, position, date, hour, phone }) {
  const adminIds = (process.env.ADMIN_IDS || '').split(',').map(s => Number(s.trim())).filter(Boolean);
  if (!adminIds.length) return;

  const { buildAdminKeyboard } = require('../keyboards');
  const username = ctx.from.username ? `@${ctx.from.username}` : 'N/A';
  const text = t('en', 'admin_notify', { id, name, position, date, hour, phone: phone || 'N/A', user_id: ctx.from.id, username });

  for (const adminId of adminIds) {
    try {
      const msg = await ctx.api.sendMessage(adminId, text, {
        reply_markup: buildAdminKeyboard(id),
      });
      saveAdminMessage(id, adminId, msg.chat.id, msg.message_id);
    } catch (e) {
      console.error(`Failed to notify admin ${adminId}:`, e.message);
    }
  }
}

module.exports = { flowCallbackHandler, flowTextHandler };
