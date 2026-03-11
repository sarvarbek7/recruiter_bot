'use strict';

const { t } = require('../i18n');
const { getAppointments, getAppointmentById, updateStatus } = require('../db');

function getAdminIds() {
  return new Set(
    (process.env.ADMIN_IDS || '').split(',').map(s => Number(s.trim())).filter(Boolean)
  );
}

function isAdmin(ctx) {
  return getAdminIds().has(ctx.from?.id);
}

async function adminListHandler(ctx) {
  if (!isAdmin(ctx)) {
    await ctx.reply('Not authorized.');
    return;
  }

  const rows = getAppointments();
  if (!rows.length) {
    await ctx.reply(t('en', 'appointments_empty'));
    return;
  }

  const lines = rows.map(r =>
    t('en', 'appointment_row', {
      id: r.id,
      name: `${r.first_name} ${r.last_name}`,
      position: r.position,
      date: r.date,
      hour: r.hour,
      status: r.status,
    })
  );

  await ctx.reply(t('en', 'appointments_header') + lines.join('\n'));
}

async function adminCallbackHandler(ctx) {
  await ctx.answerCallbackQuery();

  if (!isAdmin(ctx)) {
    await ctx.answerCallbackQuery({ text: 'Not authorized.', show_alert: true });
    return;
  }

  const data = ctx.callbackQuery.data;
  const parts = data.split(':');
  // cb:admin_accept:ID or cb:admin_reject:ID
  const action = parts[1]; // 'admin_accept' or 'admin_reject'
  const id = parseInt(parts[2]);
  const status = action === 'admin_accept' ? 'accepted' : 'rejected';

  updateStatus(id, status);

  const appointment = getAppointmentById(id);
  if (!appointment) {
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    return;
  }

  // Edit admin message to remove buttons and append status
  const statusEmoji = status === 'accepted' ? '✅ Accepted' : '❌ Rejected';
  try {
    await ctx.editMessageText(
      ctx.callbackQuery.message.text + `\n\nStatus: ${statusEmoji}`,
      { reply_markup: { inline_keyboard: [] } }
    );
  } catch (e) {
    // Message may not have changed text — just remove buttons
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  }

  // Notify the candidate
  const lang = appointment.lang || 'en';
  const msgKey = status === 'accepted' ? 'admin_accepted' : 'admin_rejected';
  try {
    await ctx.api.sendMessage(
      appointment.user_id,
      t(lang, msgKey, { date: appointment.date, hour: appointment.hour })
    );

    // Send office location if accepted
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

module.exports = { adminListHandler, adminCallbackHandler };
