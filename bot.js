const { Telegraf, Markup } = require('telegraf');
const { config } = require('dotenv');
const Database = require('better-sqlite3');

config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const db = new Database(process.env.DATABASE_PATH);

const allowedChannelId = process.env.CHANNEL_ID ? parseInt(process.env.CHANNEL_ID) : null;

const initDB = () => {
  db.exec(`CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY
  );`);

  db.exec(`CREATE TABLE IF NOT EXISTS expansions (
    name TEXT PRIMARY KEY,
    total_cards INTEGER
  );`);

  db.exec(`CREATE TABLE IF NOT EXISTS cards (
    username TEXT,
    expansion TEXT,
    card_number TEXT,
    PRIMARY KEY(username, expansion, card_number)
  );`);

  db.exec(`CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proposer TEXT,
    acceptor TEXT,
    requested_exp TEXT,
    requested_card TEXT,
    offered_exp TEXT,
    offered_card TEXT,
    status TEXT DEFAULT 'pending',
    step INTEGER DEFAULT 1,
    message_id TEXT,
    FOREIGN KEY(proposer) REFERENCES users(username)
  );`);

  db.exec(`CREATE TABLE IF NOT EXISTS trade_status (
    username TEXT PRIMARY KEY,
    in_trade BOOLEAN DEFAULT 0
  );`);
};

initDB();

const addUser = (username) => {
  try {
    db.prepare('INSERT OR IGNORE INTO users (username) VALUES (?)').run(username);
    db.prepare('INSERT OR IGNORE INTO trade_status (username) VALUES (?)').run(username);
  } catch (e) {}
};

const addExpansion = (name, totalCards) => {
  db.prepare('INSERT INTO expansions (name, total_cards) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET total_cards = ?').run(name, totalCards, totalCards);
};

const addMissingCard = (username, expansion, card) => {
  db.prepare(
    'INSERT INTO cards (username, expansion, card_number) VALUES (?, ?, ?)'
  ).run(username, expansion, card);
};

// Trade functionality helpers
const getTradeStatus = (username) => {
  return db.prepare('SELECT in_trade FROM trade_status WHERE username = ?').get(username);
};

const updateTradeStatus = (username, status) => {
  db.prepare('UPDATE trade_status SET in_trade = ? WHERE username = ?').run(status ? 1 : 0, username);
};

const getAllMissingCards = () => {
  return db.prepare(`
    SELECT username, expansion, card_number 
    FROM cards 
    ORDER BY username, expansion, CAST(card_number AS INTEGER)
  `).all();
};

const isCorrectChannel = (ctx) => {
  if (allowedChannelId && ctx.chat && ctx.chat.id !== allowedChannelId) {
    const channelLink = `https://t.me/${ctx.chat.username}`;
    ctx.reply(`Please use the bot in the designated channel: @${ctx.chat.username} ${channelLink}`);
    return false;
  }
  return true;
};

bot.command('start', (ctx) => {
  addUser(ctx.from.username);
  ctx.reply('Welcome to the Pokémon TCG Pocket trading bot!');
});

bot.command('add_expansion', (ctx) => {
  if (!isCorrectChannel(ctx)) return;
  let input = ctx.message.text.replace('/add_expansion ', '');
  const [name, totalCards] = input.split('|');
  if (!name || !totalCards) {
    return ctx.reply('Usage: /add_expansion <name>|<total cards>');
  }
  addExpansion(name, parseInt(totalCards, 10));
  ctx.reply(`Expansion ${name} added with ${totalCards} cards.`);
});

bot.command('add_missing', (ctx) => {
  if (!isCorrectChannel(ctx)) return;
  let input = ctx.message.text.replace('/add_missing ', '');
  const [expansion, cardNumber] = input.split('|');
  if (!expansion || !cardNumber) {
    return ctx.reply('Usage: /add_missing <expansion>|<card number>');
  }
  addMissingCard(ctx.from.username, expansion, cardNumber);
  ctx.reply(`Card ${cardNumber} from expansion ${expansion} added to your missing list.`);
});

bot.command('trade', (ctx) => {
  if (!isCorrectChannel(ctx)) return;
  const input = ctx.message.text.replace('/trade ', '').trim();
  const [expansion, card] = input.split('|');
  
  if (!expansion || !card) {
    return ctx.reply('Usage: /trade <expansion>|<card>');
  }

  addUser(ctx.from.username);
  if (getTradeStatus(ctx.from.username)?.in_trade) {
    return ctx.reply('You are already in a trade!');
  }

  const isMissing = db.prepare(`
    SELECT 1 FROM cards 
    WHERE username = ? AND expansion = ? AND card_number = ?
  `).get(ctx.from.username, expansion, card);

  if (!isMissing) {
    return ctx.reply("You can't request a card you're not missing!");
  }

  db.prepare(`
    INSERT INTO trades (proposer, requested_exp, requested_card, status)
    VALUES (?, ?, ?, 'pending')
  `).run(ctx.from.username, expansion, card);

  updateTradeStatus(ctx.from.username, true);

  ctx.reply(
    `📢 @${ctx.from.username} wants ${expansion}|${card}!\n` +
    `Can someone provide this card?`,
    Markup.inlineKeyboard([
      Markup.button.callback('Offer Card', `offer_${ctx.from.username}_${expansion}_${card}`)
    ])
  );
});

bot.action(/offer_(.+)_(.+)_(.+)/, async (ctx) => {
  const [proposer, reqExp, reqCard] = ctx.match.slice(1);
  const acceptor = ctx.from.username;

  if (proposer === acceptor) {
    return ctx.answerCbQuery("You can't trade with yourself!");
  }

  if (getTradeStatus(acceptor)?.in_trade) {
    return ctx.answerCbQuery("You're already in a trade!");
  }

  const hasCard = db.prepare(`
    SELECT 1 FROM cards 
    WHERE username = ? AND expansion = ? AND card_number = ?
  `).get(acceptor, reqExp, reqCard);

  if (hasCard) {
    return ctx.answerCbQuery("You don't have this card to trade!");
  }

  ctx.replyWithMarkdown(
    `Reply with the card you want from @${proposer} using format:\n` +
    `\`/offer ${proposer}|<expansion>|<card>\``
  );
});

bot.command('offer', (ctx) => {
  if (!isCorrectChannel(ctx)) return;
  const input = ctx.message.text.replace('/offer ', '').trim();
  const [proposer, expansion, card] = input.split('|');

  if (!proposer || !expansion || !card) {
    return ctx.reply('Usage: /offer <proposer>|<expansion>|<card>');
  }

  const acceptor = ctx.from.username;

  const proposerExists = db.prepare('SELECT 1 FROM users WHERE username = ?').get(proposer);
  if (!proposerExists) {
    return ctx.reply('Invalid proposer!');
  }

  const proposerHasCard = !db.prepare(`
    SELECT 1 FROM cards 
    WHERE username = ? AND expansion = ? AND card_number = ?
  `).get(proposer, expansion, card);

  if (!proposerHasCard) {
    return ctx.reply("Proposer doesn't have this card!");
  }

  const trade = db.prepare(`
    SELECT * FROM trades 
    WHERE proposer = ? 
    AND status = 'pending'
  `).get(proposer);

  if (!trade) {
    return ctx.reply('No active trade found for this user!');
  }

  db.prepare(`
    UPDATE trades SET
      acceptor = ?,
      offered_exp = ?,
      offered_card = ?,
      status = 'active'
    WHERE id = ?
  `).run(acceptor, expansion, card, trade.id);

  updateTradeStatus(proposer, true);
  updateTradeStatus(acceptor, true);

  const proposerMsg = ctx.telegram.sendMessage(
    proposer,
    `Trade offer from @${acceptor}:\n` +
    `You receive: ${trade.requested_exp}|${trade.requested_card}\n` +
    `You send: ${expansion}|${card}\n` +
    'Confirm this trade:',
    Markup.inlineKeyboard([
      Markup.button.callback('✅ Confirm', `confirm_${trade.id}`),
      Markup.button.callback('❌ Cancel', `cancel_${trade.id}`)
    ])
  );

  const acceptorMsg = ctx.telegram.sendMessage(
    acceptor,
    `Trade offer to @${proposer}:\n` +
    `You send: ${trade.requested_exp}|${trade.requested_card}\n` +
    `You receive: ${expansion}|${card}\n` +
    'Confirm this trade:',
    Markup.inlineKeyboard([
      Markup.button.callback('✅ Confirm', `confirm_${trade.id}`),
      Markup.button.callback('❌ Cancel', `cancel_${trade.id}`)
    ])
  );

  db.prepare('UPDATE trades SET message_id = ? WHERE id = ?')
    .run(`${proposerMsg.message_id},${acceptorMsg.message_id}`, trade.id);
});

bot.action(/confirm_(\d+)/, async (ctx) => {
  const tradeId = ctx.match[1];
  const trade = db.prepare('SELECT * FROM trades WHERE id = ?').get(tradeId);
  
  db.prepare('UPDATE trades SET step = step + 1 WHERE id = ?').run(tradeId);
  const updated = db.prepare('SELECT * FROM trades WHERE id = ?').get(tradeId);

  if (updated.step >= 2) {
    db.prepare('DELETE FROM cards WHERE username = ? AND expansion = ? AND card_number = ?')
      .run(trade.proposer, trade.requested_exp, trade.requested_card);
    db.prepare('DELETE FROM cards WHERE username = ? AND expansion = ? AND card_number = ?')
      .run(trade.acceptor, trade.offered_exp, trade.offered_card);

    db.prepare('UPDATE trades SET status = "completed" WHERE id = ?').run(tradeId);
    updateTradeStatus(trade.proposer, false);
    updateTradeStatus(trade.acceptor, false);

    ctx.telegram.editMessageText(
      trade.proposer,
      trade.message_id.split(',')[0],
      null,
      `✅ Trade completed! Received ${trade.requested_exp}|${trade.requested_card}`
    );
    ctx.telegram.editMessageText(
      trade.acceptor,
      trade.message_id.split(',')[1],
      null,
      `✅ Trade completed! Received ${trade.offered_exp}|${trade.offered_card}`
    );
  } else {
    ctx.answerCbQuery('Confirmation received! Waiting for counterparty...');
  }
});

bot.action(/cancel_(\d+)/, (ctx) => {
  const tradeId = ctx.match[1];
  const trade = db.prepare('SELECT * FROM trades WHERE id = ?').get(tradeId);
  
  if (trade) {
    db.prepare('DELETE FROM trades WHERE id = ?').run(tradeId);
    updateTradeStatus(trade.proposer, false);
    updateTradeStatus(trade.acceptor, false);

    ctx.telegram.editMessageText(
      trade.proposer,
      trade.message_id.split(',')[0],
      null,
      '❌ Trade cancelled'
    );
    ctx.telegram.editMessageText(
      trade.acceptor,
      trade.message_id.split(',')[1],
      null,
      '❌ Trade cancelled'
    );
  }
});

if (process.env.ENV === 'debug') {
  bot.on('message', (ctx) => {
    console.log('Received message:', ctx.message);
  });
}

bot.launch({
  webhook: {
    domain: process.env.BOT_DOMAIN,
    port: 3000
  }
}).then(() => console.log("Webhook bot listening on port", 3000));
