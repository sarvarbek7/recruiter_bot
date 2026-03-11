'use strict';

const { InputFile } = require('grammy');
const { t } = require('../i18n');
const { getAppointmentById, updateStatus, getAppointmentsByDateAndStatus } = require('../db');
const { buildAdminCalendarKeyboard, buildAdminKeyboard } = require('../keyboards');
const { buildAppointmentsExcel } = require('../excel');

function getAdminIds() {
  return new Set(
    (process.env.ADMIN_IDS || '').split(',').map(s => Number(s.trim())).filter(Boolean)
  );
}

function isAdmin(ctx) {
  return getAdminIds().has(ctx.from?.id);
}

/** /appointments — show a date-picker calendar */
async function adminListHandler(ctx) {
  if (!isAdmin(ctx)) {
    await ctx.reply('Not authorized.');
    return;
  }

  const now = new Date();
  await ctx.reply('📅 Select a date to get approved appointments:', {
    reply_markup: buildAdminCalendarKeyboard(now.getFullYear(), now.getMonth()),
  });
}

/** Handles cb:admin_cal_prev, cb:admin_cal_next, cb:admin_cal_day */
async function adminCalendarCallbackHandler(ctx) {
  await ctx.answerCallbackQuery();

  if (!isAdmin(ctx)) return;

  const data = ctx.callbackQuery.data;
  // cb:admin_cal_prev:YEAR:MONTH  or  cb:admin_cal_next:YEAR:MONTH
  if (data.startsWith('cb:admin_cal_prev:') || data.startsWith('cb:admin_cal_next:')) {
    const parts = data.split(':');
    const year = parseInt(parts[3]);
    const month = parseInt(parts[4]);
    await ctx.editMessageReplyMarkup(buildAdminCalendarKeyboard(year, month));
    return;
  }

  // cb:admin_cal_day:YYYY-MM-DD
  if (data.startsWith('cb:admin_cal_day:')) {
    const date = data.slice('cb:admin_cal_day:'.length);
    await sendAppointmentsExcelForDate(ctx, date);
  }
}

async function sendAppointmentsExcelForDate(ctx, date) {
  const rows = getAppointmentsByDateAndStatus(date, 'accepted');

  if (!rows.length) {
    await ctx.editMessageText(`📅 ${date}\n\nNo approved appointments for this date.`);
    return;
  }

  const buffer = await buildAppointmentsExcel(rows, date);

  // Remove the calendar message first
  await ctx.deleteMessage();

  await ctx.replyWithDocument(
    new InputFile(Buffer.from(buffer), `appointments_${date}.xlsx`),
    { caption: `✅ Approved appointments for ${date} (${rows.length} total)` }
  );
}

async function adminCallbackHandler(ctx) {
  await ctx.answerCallbackQuery();

  if (!isAdmin(ctx)) {
    await ctx.answerCallbackQuery({ text: 'Not authorized.', show_alert: true });
    return;
  }

  const data = ctx.callbackQuery.data;
  const parts = data.split(':');
  const action = parts[1]; // 'admin_accept' or 'admin_reject'
  const id = parseInt(parts[2]);
  const status = action === 'admin_accept' ? 'accepted' : 'rejected';

  updateStatus(id, status);

  const appointment = getAppointmentById(id);
  if (!appointment) {
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    return;
  }

  const statusEmoji = status === 'accepted' ? '✅ Accepted' : '❌ Rejected';
  try {
    await ctx.editMessageText(
      ctx.callbackQuery.message.text + `\n\nStatus: ${statusEmoji}`,
      { reply_markup: { inline_keyboard: [] } }
    );
  } catch (e) {
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  }

  const lang = appointment.lang || 'en';
  const msgKey = status === 'accepted' ? 'admin_accepted' : 'admin_rejected';
  try {
    await ctx.api.sendMessage(
      appointment.user_id,
      t(lang, msgKey, { date: appointment.date, hour: appointment.hour })
    );

    if (status === 'accepted') {
      const lat = parseFloat(process.env.LOCATION_LATITUDE);
      const lon = parseFloat(process.env.LOCATION_LONGITUDE);
      if (!isNaN(lat) && !isNaN(lon)) {
        await ctx.api.sendLocation(appointment.user_id, lat, lon);
      }
    }
  } catch (e) {
    console.error(`Failed to notify user ${appointment.user_id}:`, e.message);
  }
}

module.exports = { adminListHandler, adminCalendarCallbackHandler, adminCallbackHandler };
