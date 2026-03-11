'use strict';

const { t } = require('./i18n');

const MONTH_NAMES = {
  en: ['January','February','March','April','May','June','July','August','September','October','November','December'],
  uz: ['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'],
  ru: ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'],
};

function buildLangKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '🇬🇧 English', callback_data: 'cb:lang:en' },
        { text: "🇺🇿 O'zbek", callback_data: 'cb:lang:uz' },
        { text: '🇷🇺 Русский', callback_data: 'cb:lang:ru' },
      ],
    ],
  };
}

/**
 * Build a month calendar inline keyboard.
 * Past days are blank. Fully-booked days show as "✗N" (not clickable).
 * @param {Object} bookedByDate - { [dateStr]: Set<hour> } from getBookedSlotsForMonth()
 */
function buildCalendarKeyboard(year, month, lang = 'en', bookedByDate = {}) {
  const tzToday = todayUZ();
  const daysAhead = (parseInt(process.env.BOOKING_DAYS_AHEAD) || 7) - 1;
  const maxDate = toISODate(new Date(
    new Date(`${tzToday}T00:00:00Z`).getTime() + daysAhead * 24 * 60 * 60 * 1000
  ));

  const monthNames = MONTH_NAMES[lang] || MONTH_NAMES.en;
  const title = `${monthNames[month]} ${year}`;

  const prevDate = new Date(year, month - 1, 1);
  const nextDate = new Date(year, month + 1, 1);

  // A month has selectable dates if [tzToday, maxDate] overlaps with it
  const monthHasDates = (y, m) => {
    const firstOfMonth = toISODate(new Date(y, m, 1));
    const lastOfMonth = toISODate(new Date(y, m + 1, 0));
    return tzToday <= lastOfMonth && maxDate >= firstOfMonth;
  };
  const hasPrev = monthHasDates(prevDate.getFullYear(), prevDate.getMonth());
  const hasNext = monthHasDates(nextDate.getFullYear(), nextDate.getMonth());

  const rows = [];

  // Navigation row — disabled buttons show as blank space
  rows.push([
    hasPrev
      ? { text: '◀', callback_data: `cb:cal_prev:${prevDate.getFullYear()}:${prevDate.getMonth()}` }
      : { text: ' ', callback_data: 'cb:noop' },
    { text: title, callback_data: 'cb:noop' },
    hasNext
      ? { text: '▶', callback_data: `cb:cal_next:${nextDate.getFullYear()}:${nextDate.getMonth()}` }
      : { text: ' ', callback_data: 'cb:noop' },
  ]);

  // Day-of-week header (Mon–Sun)
  rows.push(['Mo','Tu','We','Th','Fr','Sa','Su'].map(d => ({ text: d, callback_data: 'cb:noop' })));

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7;

  let week = [];
  for (let i = 0; i < firstDow; i++) {
    week.push({ text: ' ', callback_data: 'cb:noop' });
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = toISODate(new Date(year, month, day));
    const isPast = dateStr < tzToday;
    const isBeyond = dateStr > maxDate;

    let btn;
    if (isPast || isBeyond) {
      btn = { text: ' ', callback_data: 'cb:noop' };
    } else if (_isDateFullyBooked(dateStr, bookedByDate)) {
      btn = { text: `✗${day}`, callback_data: 'cb:noop' };
    } else {
      btn = { text: String(day), callback_data: `cb:cal_day:${dateStr}` };
    }

    week.push(btn);
    if (week.length === 7) {
      rows.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push({ text: ' ', callback_data: 'cb:noop' });
    rows.push(week);
  }

  return { inline_keyboard: rows };
}

/** Returns true if all available slots for a date are booked. */
function _isDateFullyBooked(dateStr, bookedByDate) {
  const booked = bookedByDate[dateStr];
  if (!booked || booked.size === 0) return false;
  const available = _availableSlots(dateStr);
  return available.length > 0 && available.every(s => booked.has(s));
}

/** Slots available for a date considering today's time filter (UTC+5). */
function _availableSlots(dateStr) {
  const isToday = dateStr === todayUZ();
  const currentMinutes = isToday ? nowMinutesUZ() : 0;
  return SLOTS.filter(slot => {
    if (!isToday) return true;
    const [h, min] = slot.split(':').map(Number);
    return h * 60 + min > currentMinutes;
  });
}

/** Returns true if there is at least one slot that is not past and not booked. */
function hasAvailableSlots(dateStr, bookedHours = new Set()) {
  return _availableSlots(dateStr).some(s => !bookedHours.has(s));
}

/** Get today's date string "YYYY-MM-DD" in UTC+5. */
function todayUZ() {
  const d = new Date(Date.now() + 5 * 60 * 60 * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Get current time in minutes since midnight, in UTC+5. */
function nowMinutesUZ() {
  const d = new Date(Date.now() + 5 * 60 * 60 * 1000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

// Available slots: 10:00–12:00 and 14:00–17:00, every 30 minutes
const SLOTS = [];
for (const [start, end] of [[10 * 60, 12 * 60], [14 * 60, 17 * 60]]) {
  for (let m = start; m <= end; m += 30) {
    SLOTS.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  }
}

/**
 * @param {string} selectedDate - "YYYY-MM-DD"
 * @param {string} [lang]
 * @param {Set<string>} [bookedHours] - already booked slots for this date
 */
function buildHourKeyboard(selectedDate, lang = 'en', bookedHours = new Set()) {
  const slots = _availableSlots(selectedDate);

  const backLabels = { en: '◀ Back to calendar', uz: '◀ Kalendariga qaytish', ru: '◀ Назад к календарю' };
  const rows = [];
  for (let i = 0; i < slots.length; i += 2) {
    const makeBtn = slot => bookedHours.has(slot)
      ? { text: `✗ ${slot}`, callback_data: 'cb:noop' }
      : { text: slot, callback_data: `cb:hour:${slot}` };
    const row = [makeBtn(slots[i])];
    if (slots[i + 1]) row.push(makeBtn(slots[i + 1]));
    rows.push(row);
  }
  rows.push([{ text: backLabels[lang] || backLabels.en, callback_data: 'cb:hour_back' }]);
  return { inline_keyboard: rows };
}

function buildAdminKeyboard(appointmentId) {
  return {
    inline_keyboard: [
      [
        { text: '✅ Accept', callback_data: `cb:admin_accept:${appointmentId}` },
        { text: '❌ Reject', callback_data: `cb:admin_reject:${appointmentId}` },
      ],
    ],
  };
}

function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function buildPhoneKeyboard(lang = 'en') {
  const labels = { en: '📱 Share Phone Number', uz: '📱 Telefon raqamni ulashish', ru: '📱 Поделиться номером' };
  return {
    keyboard: [[{ text: labels[lang] || labels.en, request_contact: true }]],
    resize_keyboard: true,
    one_time_keyboard: true,
  };
}

function removeKeyboard() {
  return { remove_keyboard: true };
}

module.exports = { buildLangKeyboard, buildCalendarKeyboard, buildHourKeyboard, buildAdminKeyboard, buildPhoneKeyboard, removeKeyboard, hasAvailableSlots };
