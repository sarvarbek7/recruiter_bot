'use strict';

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.SQLITE_DB_PATH || './recruiter_bot.db';
const db = new Database(path.resolve(dbPath));

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

// Migrate: add phone column if it doesn't exist yet
try {
  db.exec(`ALTER TABLE appointments ADD COLUMN phone TEXT`);
} catch (e) {
  // Column already exists — ignore
}

const stmtCreate = db.prepare(`
  INSERT INTO appointments (user_id, username, first_name, last_name, position, date, hour, phone, lang)
  VALUES (@user_id, @username, @first_name, @last_name, @position, @date, @hour, @phone, @lang)
`);

const stmtUpdateStatus = db.prepare(`
  UPDATE appointments SET status = ? WHERE id = ?
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

function updateStatus(id, status) {
  stmtUpdateStatus.run(status, id);
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

function deleteRejectedAppointments() {
  db.prepare(`DELETE FROM appointments WHERE status = 'rejected'`).run();
}

module.exports = { createAppointment, updateStatus, getAppointments, getAppointmentById, isSlotTaken, getBookedHoursForDate, getBookedSlotsForMonth, getAppointmentsByDateAndStatus, deleteRejectedAppointments };
