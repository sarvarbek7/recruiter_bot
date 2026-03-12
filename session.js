'use strict';

function initialSession() {
  const now = new Date();
  return {
    step: 'STEP_LANG',
    lang: null,
    firstName: null,
    lastName: null,
    position: null,
    date: null,
    hour: null,
    calendarYear: now.getFullYear(),
    calendarMonth: now.getMonth(),
    adminStep: null,
  };
}

module.exports = { initialSession };
