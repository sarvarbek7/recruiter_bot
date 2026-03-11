'use strict';

const ExcelJS = require('exceljs');

/**
 * Build an Excel buffer from an array of appointment rows.
 * @param {Object[]} appointments
 * @param {string} date - "YYYY-MM-DD" used for the sheet title
 * @returns {Promise<Buffer>}
 */
async function buildAppointmentsExcel(appointments, date) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(`Appointments ${date}`);

  sheet.columns = [
    { header: '#',          key: 'id',         width: 6  },
    { header: 'First Name', key: 'first_name',  width: 15 },
    { header: 'Last Name',  key: 'last_name',   width: 15 },
    { header: 'Position',   key: 'position',    width: 22 },
    { header: 'Date',       key: 'date',        width: 12 },
    { header: 'Time',       key: 'hour',        width: 8  },
    { header: 'Phone',      key: 'phone',       width: 16 },
    { header: 'Username',   key: 'username',    width: 16 },
  ];

  sheet.getRow(1).font = { bold: true };

  for (const row of appointments) {
    sheet.addRow({
      id:         row.id,
      first_name: row.first_name,
      last_name:  row.last_name,
      position:   row.position,
      date:       row.date,
      hour:       row.hour,
      phone:      row.phone || '—',
      username:   row.username ? `${row.username}` : '—',
    });
  }

  return workbook.xlsx.writeBuffer();
}

module.exports = { buildAppointmentsExcel };
