'use strict';

const { t } = require('../i18n');
const { buildLangKeyboard } = require('../keyboards');
const { initialSession } = require('../session');

async function startHandler(ctx) {
  Object.assign(ctx.session, initialSession());
  await ctx.reply(t('en', 'welcome'), {
    reply_markup: buildLangKeyboard(),
  });
}

module.exports = { startHandler };
