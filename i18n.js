'use strict';

const en = require('./i18n/en/messages.json');
const uz = require('./i18n/uz/messages.json');
const ru = require('./i18n/ru/messages.json');

const messages = { en, uz, ru };

/**
 * Translate a key for a given language with optional variable substitution.
 * @param {string} lang - 'en' | 'uz' | 'ru'
 * @param {string} key
 * @param {Record<string, string|number>} [vars]
 */
function t(lang, key, vars = {}) {
  const dict = messages[lang] || messages.en;
  let str = dict[key] || messages.en[key] || key;
  for (const [k, v] of Object.entries(vars)) {
    str = str.replaceAll(`{{${k}}}`, v);
  }
  return str;
}

module.exports = { t };
