'use strict';

const ExcelJS = require('exceljs');

const COLUMNS = [
  { header: '#',                  key: 'id',                    width: 6  },
  { header: 'First Name',         key: 'first_name',            width: 15 },
  { header: 'Last Name',          key: 'last_name',             width: 15 },
  { header: 'Position',           key: 'position',              width: 22 },
  { header: 'Date',               key: 'date',                  width: 12 },
  { header: 'Time',               key: 'hour',                  width: 8  },
  { header: 'Phone',              key: 'phone',                 width: 16 },
  { header: 'Candidate Username', key: 'username',              width: 20 },
  { header: 'Admin Username',     key: 'approved_by_username',  width: 20 },
];

function addSheet(workbook, title, rows) {
  const sheet = workbook.addWorksheet(title);
  sheet.columns = COLUMNS;
  sheet.getRow(1).font = { bold: true };

  for (const row of rows) {
    sheet.addRow({
      id:                   row.id,
      first_name:           row.first_name,
      last_name:            row.last_name,
      position:             row.position,
      date:                 row.date,
      hour:                 row.hour,
      phone:                row.phone || '—',
      username:             row.username || '—',
      approved_by_username: row.approved_by_username || '—',
    });
  }
}

/**
 * Build an Excel buffer with two sheets: Approved and Rejected.
 * @param {{ accepted: Object[], rejected: Object[] }} appointments
 * @param {string} date - "YYYY-MM-DD" used in sheet titles
 * @returns {Promise<Buffer>}
 */
async function buildAppointmentsExcel({ accepted, rejected }, date) {
  const workbook = new ExcelJS.Workbook();
  addSheet(workbook, `Approved`, accepted);
  addSheet(workbook, `Rejected`, rejected);
  return workbook.xlsx.writeBuffer();
}

module.exports = { buildAppointmentsExcel };
