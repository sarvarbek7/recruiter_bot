'use strict';

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.SQLITE_DB_PATH || './recruiter_bot.db';
const db = new Database(path.resolve(dbPath));

db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS appointments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    username   TEXT,
    first_name TEXT NOT NULL,
    last_name  TEXT NOT NULL,
    position   TEXT NOT NULL,
    date       TEXT NOT NULL,
    hour       TEXT NOT NULL,
    lang       TEXT NOT NULL DEFAULT 'en',
    phone      TEXT,
    status     TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS appointment_admin_messages (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    appointment_id INTEGER NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    admin_id       INTEGER NOT NULL,
    chat_id        INTEGER NOT NULL,
    message_id     INTEGER NOT NULL,
    UNIQUE(appointment_id, admin_id)
  )
`);

// Migrate appointment_admin_messages to add FK if the table was created without it
if (db.pragma('foreign_key_list(appointment_admin_messages)').length === 0) {
  db.pragma('foreign_keys = OFF');
  db.exec(`
    BEGIN TRANSACTION;
    CREATE TABLE appointment_admin_messages_new (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      appointment_id INTEGER NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
      admin_id       INTEGER NOT NULL,
      chat_id        INTEGER NOT NULL,
      message_id     INTEGER NOT NULL,
      UNIQUE(appointment_id, admin_id)
    );
    INSERT INTO appointment_admin_messages_new SELECT * FROM appointment_admin_messages;
    DROP TABLE appointment_admin_messages;
    ALTER TABLE appointment_admin_messages_new RENAME TO appointment_admin_messages;
    COMMIT;
  `);
  db.pragma('foreign_keys = ON');
}

// Migrations
for (const col of [
  `ALTER TABLE appointments ADD COLUMN phone TEXT`,
  `ALTER TABLE appointments ADD COLUMN approved_by_username TEXT`,
  `ALTER TABLE appointments ADD COLUMN approved_by_telegram_id INTEGER`,
]) {
  try { db.exec(col); } catch (e) { /* already exists */ }
}

const stmtCreate = db.prepare(`
  INSERT INTO appointments (user_id, username, first_name, last_name, position, date, hour, phone, lang)
  VALUES (@user_id, @username, @first_name, @last_name, @position, @date, @hour, @phone, @lang)
`);

const stmtUpdateStatus = db.prepare(`
  UPDATE appointments SET status = ?, approved_by_username = ?, approved_by_telegram_id = ? WHERE id = ?
`);

const stmtGetAll = db.prepare(`
  SELECT * FROM appointments ORDER BY created_at DESC
`);

const stmtGetById = db.prepare(`
  SELECT * FROM appointments WHERE id = ?
`);

const stmtIsSlotTaken = db.prepare(`
  SELECT 1 FROM appointments WHERE date = ? AND hour = ? AND status != 'rejected' LIMIT 1
`);

function createAppointment(data) {
  const result = stmtCreate.run(data);
  return result.lastInsertRowid;
}

function updateStatus(id, status, approvedByUsername = null, approvedByTelegramId = null) {
  stmtUpdateStatus.run(status, approvedByUsername, approvedByTelegramId, id);
}

function saveAdminMessage(appointmentId, adminId, chatId, messageId) {
  db.prepare(`
    INSERT OR IGNORE INTO appointment_admin_messages (appointment_id, admin_id, chat_id, message_id)
    VALUES (?, ?, ?, ?)
  `).run(appointmentId, adminId, chatId, messageId);
}

function getAdminMessages(appointmentId) {
  return db.prepare(
    `SELECT * FROM appointment_admin_messages WHERE appointment_id = ?`
  ).all(appointmentId);
}

function getAppointments() {
  return stmtGetAll.all();
}

function getAppointmentById(id) {
  return stmtGetById.get(id);
}

function isSlotTaken(date, hour) {
  return !!stmtIsSlotTaken.get(date, hour);
}

/** Returns a Set of booked hours for a specific date (excluding rejected). */
function getBookedHoursForDate(date) {
  const rows = db.prepare(
    `SELECT hour FROM appointments WHERE date = ? AND status != 'rejected'`
  ).all(date);
  return new Set(rows.map(r => r.hour));
}

/** Returns { [dateStr]: Set<hour> } for all booked slots in a given month (excluding rejected). */
function getBookedSlotsForMonth(year, month) {
  const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
  const rows = db.prepare(
    `SELECT date, hour FROM appointments WHERE date LIKE ? AND status != 'rejected'`
  ).all(`${monthStr}-%`);
  const result = {};
  for (const row of rows) {
    if (!result[row.date]) result[row.date] = new Set();
    result[row.date].add(row.hour);
  }
  return result;
}

function getAppointmentsByDateAndStatus(date, status) {
  return db.prepare(
    `SELECT * FROM appointments WHERE date = ? AND status = ? ORDER BY hour ASC`
  ).all(date, status);
}

function getPendingAppointmentsForDate(date) {
  return db.prepare(
    `SELECT * FROM appointments WHERE date = ? AND status = 'pending' ORDER BY hour ASC`
  ).all(date);
}

function deletePendingAppointmentsForDate(date) {
  db.prepare(`DELETE FROM appointments WHERE date = ? AND status = 'pending'`).run(date);
}

module.exports = { createAppointment, updateStatus, getAppointments, getAppointmentById, isSlotTaken, getBookedHoursForDate, getBookedSlotsForMonth, getAppointmentsByDateAndStatus, getPendingAppointmentsForDate, deletePendingAppointmentsForDate, saveAdminMessage, getAdminMessages };
