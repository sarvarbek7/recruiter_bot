'use strict';

const cron = require('node-cron');
const { InputFile } = require('grammy');
const { getAppointmentsByDateAndStatus, getPendingAppointmentsForDate, deletePendingAppointmentsForDate } = require('./db');
const { buildAppointmentsExcel } = require('./excel');

function getAdminIds() {
  return (process.env.ADMIN_IDS || '').split(',').map(s => Number(s.trim())).filter(Boolean);
}

function todayUZ() {
  const d = new Date(Date.now() + 5 * 60 * 60 * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Send today's accepted appointments as Excel to all admins.
 */
async function sendDailyReport(bot) {
  const date = todayUZ();
  const accepted = getAppointmentsByDateAndStatus(date, 'accepted');
  const rejected = getAppointmentsByDateAndStatus(date, 'rejected');
  const adminIds = getAdminIds();

  if (!adminIds.length) return;

  if (!accepted.length && !rejected.length) {
    for (const adminId of adminIds) {
      try {
        await bot.api.sendMessage(adminId, `📅 Daily report for ${date}\n\nNo appointments today.`);
      } catch (e) {
        console.error(`Failed to send daily report to admin ${adminId}:`, e.message);
      }
    }
    return;
  }

  const buffer = await buildAppointmentsExcel({ accepted, rejected }, date);

  for (const adminId of adminIds) {
    try {
      await bot.api.sendDocument(
        adminId,
        new InputFile(Buffer.from(buffer), `appointments_${date}.xlsx`),
        { caption: `📅 Daily report — ${date}\n✅ ${accepted.length} approved  ❌ ${rejected.length} rejected` }
      );
    } catch (e) {
      console.error(`Failed to send daily report to admin ${adminId}:`, e.message);
    }
  }
}

/**
 * Notify admins of expired pending appointments, then delete them.
 */
async function cleanupExpiredPending(bot) {
  const date = todayUZ();
  const pending = getPendingAppointmentsForDate(date);

  if (!pending.length) return;

  const adminIds = getAdminIds();
  const lines = pending.map(a =>
    `• N_${a.id}: ${a.first_name} ${a.last_name} — ${a.position} — ${a.hour}`
  ).join('\n');
  const text = `⏰ The following pending appointments for ${date} have expired and will be deleted:\n\n${lines}`;

  for (const adminId of adminIds) {
    try {
      await bot.api.sendMessage(adminId, text);
    } catch (e) {
      console.error(`Failed to notify admin ${adminId} of expired appointments:`, e.message);
    }
  }

  deletePendingAppointmentsForDate(date);
  console.log(`[scheduler] Deleted ${pending.length} expired pending appointment(s) for ${date}.`);
}

/**
 * Start scheduled jobs:
 *  - 09:00 UZ (UTC+5) → send daily report to admins
 *  - 19:00 UZ (UTC+5) → notify admins of expired pending appointments and delete them
 */
function startScheduler(bot) {
  // 09:00 Asia/Tashkent
  cron.schedule('0 9 * * *', async () => {
    console.log('[scheduler] Sending daily appointments report...');
    try {
      await sendDailyReport(bot);
    } catch (e) {
      console.error('[scheduler] Daily report error:', e.message);
    }
  }, { timezone: 'Asia/Tashkent' });

  // 19:00 Asia/Tashkent
  cron.schedule('0 19 * * *', async () => {
    console.log('[scheduler] Cleaning up expired pending appointments...');
    try {
      await cleanupExpiredPending(bot);
    } catch (e) {
      console.error('[scheduler] Cleanup error:', e.message);
    }
  }, { timezone: 'Asia/Tashkent' });

  console.log('Scheduler started (daily report 09:00, cleanup 19:00 UZ time).');
}

module.exports = { startScheduler, sendDailyReport };
