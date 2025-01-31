/**
 * Author: Mateus M. Côrtes
 * Email: mateus@lacorte.dev
 * 
 * MIT License
 * 
 * Copyright (c) 2025 Mateus M. Côrtes
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

const { Telegraf } = require('telegraf');
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
    username INTEGER,
    expansion TEXT,
    card_number TEXT,
    PRIMARY KEY(username, expansion, card_number),
    FOREIGN KEY(username) REFERENCES users(username),
    FOREIGN KEY(expansion) REFERENCES expansions(name)
  );`);
};

initDB();

const addUser = (username) => {
  try {
    db.prepare('INSERT INTO users (username) VALUES (?)').run(username);
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

const removeCard = (username, expansion, card) => {
  const stmt = db.prepare('SELECT * FROM cards WHERE username = ? AND expansion = ? AND card_number = ?');
  const row = stmt.get(username, expansion, card);
  if (row) {
    db.prepare('DELETE FROM cards WHERE user_id = ? AND expansion = ? AND card_number = ?').run(userId, expansion, cardNumber);
  }
};

const getMissingCards = (username, expansion) => {
  return db.prepare('SELECT card_number FROM cards WHERE username = ? AND expansion = ?').all(username, expansion);
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

bot.command('missing', (ctx) => {
  if (!isCorrectChannel(ctx)) return;
  let input = ctx.message.text.replace('/missing ', '').replace('@tcgpr_bot', '');
  const expansion = input;
  if (!expansion) {
    return ctx.reply('Usage: /missing <expansion>');
  }
  const cards = getMissingCards(ctx.from.username, expansion);
  const response = cards.length ? `Missing cards in ${expansion}: ${cards.map(c => c.card_number).join(', ')}` : 'No missing cards recorded.';
  ctx.reply(response);
});

if(process.env.ENV === 'debug') {
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
