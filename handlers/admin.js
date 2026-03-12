'use strict';

const { InputFile } = require('grammy');
const { t } = require('../i18n');
const {
  getAppointmentById, updateStatus, getAppointmentsByDateAndStatus, getAdminMessages,
  isAdminId, getAdminIds, addAdmin, removeAdmin,
} = require('../db');
const { buildAdminCalendarKeyboard, buildAdminKeyboard } = require('../keyboards');
const { buildAppointmentsExcel } = require('../excel');

function isAdmin(ctx) {
  return isAdminId(ctx.from?.id);
}

/** /appointments — show a date-picker calendar */
async function adminListHandler(ctx) {
  if (!isAdmin(ctx)) {
    await ctx.reply('Not authorized.');
    return;
  }
  const now = new Date();
  await ctx.reply('📅 Select a date to get appointments:', {
    reply_markup: buildAdminCalendarKeyboard(now.getFullYear(), now.getMonth()),
  });
}

/** /add_admin — prompt for a Telegram ID to add */
async function addAdminHandler(ctx) {
  if (!isAdmin(ctx)) { await ctx.reply('Not authorized.'); return; }
  ctx.session.adminStep = 'AWAITING_ADD_ADMIN';
  await ctx.reply('👤 Send the Telegram ID to add as admin:');
}

/** /remove_admin — prompt for a Telegram ID to remove */
async function removeAdminHandler(ctx) {
  if (!isAdmin(ctx)) { await ctx.reply('Not authorized.'); return; }
  ctx.session.adminStep = 'AWAITING_REMOVE_ADMIN';
  await ctx.reply('👤 Send the Telegram ID to remove from admins:');
}

/** /list_admins — list all admin IDs */
async function listAdminsHandler(ctx) {
  if (!isAdmin(ctx)) { await ctx.reply('Not authorized.'); return; }
  const ids = getAdminIds();
  if (!ids.length) { await ctx.reply('No admins found.'); return; }
  await ctx.reply(ids.map(id => `• ${id}`).join('\n'));
}

/**
 * Handle pending admin prompts (add/remove).
 * Returns true if the message was consumed, false to fall through to user flow.
 */
async function adminTextHandler(ctx, next) {
  const adminStep = ctx.session?.adminStep;
  if (!adminStep) return next();

  const text = ctx.message.text.trim();

  if (adminStep === 'AWAITING_ADD_ADMIN') {
    ctx.session.adminStep = null;
    const id = Number(text);
    if (!id) { await ctx.reply('❌ Invalid ID. Must be a number.'); return; }
    addAdmin(id, ctx.from.id);
    await ctx.reply(`✅ Admin ${id} added.`);
    return;
  }

  if (adminStep === 'AWAITING_REMOVE_ADMIN') {
    ctx.session.adminStep = null;
    const id = Number(text);
    if (!id) { await ctx.reply('❌ Invalid ID. Must be a number.'); return; }
    if (id === ctx.from.id) { await ctx.reply('❌ You cannot remove yourself.'); return; }
    removeAdmin(id);
    await ctx.reply(`✅ Admin ${id} removed.`);
    return;
  }

  return next();
}

/** Handles cb:admin_cal_prev, cb:admin_cal_next, cb:admin_cal_day */
async function adminCalendarCallbackHandler(ctx) {
  await ctx.answerCallbackQuery();
  if (!isAdmin(ctx)) return;

  const data = ctx.callbackQuery.data;
  if (data.startsWith('cb:admin_cal_prev:') || data.startsWith('cb:admin_cal_next:')) {
    const parts = data.split(':');
    const year = parseInt(parts[3]);
    const month = parseInt(parts[4]);
    await ctx.editMessageReplyMarkup(buildAdminCalendarKeyboard(year, month));
    return;
  }

  if (data.startsWith('cb:admin_cal_day:')) {
    const date = data.slice('cb:admin_cal_day:'.length);
    await sendAppointmentsExcelForDate(ctx, date);
  }
}

async function sendAppointmentsExcelForDate(ctx, date) {
  const accepted = getAppointmentsByDateAndStatus(date, 'accepted');
  const rejected = getAppointmentsByDateAndStatus(date, 'rejected');

  if (!accepted.length && !rejected.length) {
    await ctx.editMessageText(`📅 ${date}\n\nNo appointments for this date.`);
    return;
  }

  const buffer = await buildAppointmentsExcel({ accepted, rejected }, date);
  await ctx.deleteMessage();
  await ctx.replyWithDocument(
    new InputFile(Buffer.from(buffer), `appointments_${date}.xlsx`),
    { caption: `📅 Appointments for ${date}\n✅ ${accepted.length} approved  ❌ ${rejected.length} rejected` }
  );
}

async function adminCallbackHandler(ctx) {
  if (!isAdmin(ctx)) {
    await ctx.answerCallbackQuery({ text: 'Not authorized.', show_alert: true });
    return;
  }

  const data = ctx.callbackQuery.data;
  const parts = data.split(':');
  const action = parts[1];
  const id = parseInt(parts[2]);
  const status = action === 'admin_accept' ? 'accepted' : 'rejected';

  const appointment = getAppointmentById(id);
  if (!appointment) {
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    return;
  }

  if (appointment.status !== 'pending') {
    const by = appointment.approved_by_username || 'an admin';
    await ctx.answerCallbackQuery({
      text: `Appointment N_${id} already ${appointment.status} by ${by}`,
      show_alert: true,
    });
    return;
  }

  await ctx.answerCallbackQuery();

  const adminUsername = ctx.from.username ? `@${ctx.from.username}` : `#${ctx.from.id}`;
  const adminId = ctx.from.id;

  updateStatus(id, status, adminUsername, adminId);

  const statusEmoji = status === 'accepted' ? '✅ Accepted' : '❌ Rejected';
  const statusLine = `\n\nStatus: ${statusEmoji}\nBy: ${adminUsername}`;

  try {
    await ctx.editMessageText(
      ctx.callbackQuery.message.text + statusLine,
      { reply_markup: { inline_keyboard: [] } }
    );
  } catch (e) {
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  }

  const adminMessages = getAdminMessages(id);
  for (const msg of adminMessages) {
    if (msg.admin_id === adminId) continue;
    try {
      await ctx.api.sendMessage(
        msg.chat_id,
        `ℹ️ Appointment N_${id} was ${status} by ${adminUsername}`,
        { reply_to_message_id: msg.message_id }
      );
      await ctx.api.editMessageReplyMarkup(msg.chat_id, msg.message_id, { inline_keyboard: [] });
    } catch (e) {
      console.error(`Failed to notify admin ${msg.admin_id}:`, e.message);
    }
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

module.exports = {
  adminListHandler, adminCalendarCallbackHandler, adminCallbackHandler,
  addAdminHandler, removeAdminHandler, listAdminsHandler, adminTextHandler,
};
