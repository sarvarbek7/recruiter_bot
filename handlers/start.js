'use strict';

const { t } = require('../i18n');
const { buildLangKeyboard, buildAdminMenuKeyboard } = require('../keyboards');
const { initialSession } = require('../session');
const { isAdminId } = require('../db');

async function startHandler(ctx) {
  Object.assign(ctx.session, initialSession());

  if (isAdminId(ctx.from?.id)) {
    await ctx.reply('🛠 Admin panel:', { reply_markup: buildAdminMenuKeyboard() });
    return;
  }

  await ctx.reply(t('en', 'welcome'), {
    reply_markup: buildLangKeyboard(),
  });
}

module.exports = { startHandler };
