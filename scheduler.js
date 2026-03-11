'use strict';

const cron = require('node-cron');
const { InputFile } = require('grammy');
const { getAppointmentsByDateAndStatus, deleteRejectedAppointments } = require('./db');
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
  const rows = getAppointmentsByDateAndStatus(date, 'accepted');
  const adminIds = getAdminIds();

  if (!adminIds.length) return;

  if (!rows.length) {
    for (const adminId of adminIds) {
      try {
        await bot.api.sendMessage(adminId, `📅 Daily report for ${date}\n\nNo approved appointments today.`);
      } catch (e) {
        console.error(`Failed to send daily report to admin ${adminId}:`, e.message);
      }
    }
    return;
  }

  const buffer = await buildAppointmentsExcel(rows, date);

  for (const adminId of adminIds) {
    try {
      await bot.api.sendDocument(
        adminId,
        new InputFile(Buffer.from(buffer), `appointments_${date}.xlsx`),
        { caption: `📅 Daily report — ${date}\n✅ ${rows.length} approved appointment(s)` }
      );
    } catch (e) {
      console.error(`Failed to send daily report to admin ${adminId}:`, e.message);
    }
  }
}

/**
 * Start scheduled jobs:
 *  - 09:00 UZ (UTC+5) → send daily report to admins
 *  - 18:00 UZ (UTC+5) → delete all rejected appointments
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

  // 18:00 Asia/Tashkent
  cron.schedule('0 18 * * *', () => {
    console.log('[scheduler] Deleting rejected appointments...');
    try {
      deleteRejectedAppointments();
      console.log('[scheduler] Rejected appointments deleted.');
    } catch (e) {
      console.error('[scheduler] Delete rejected error:', e.message);
    }
  }, { timezone: 'Asia/Tashkent' });

  console.log('Scheduler started (daily report 09:00, cleanup 18:00 UZ time).');
}

module.exports = { startScheduler, sendDailyReport };
