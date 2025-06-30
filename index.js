require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { spawn } = require('child_process');
const path = require('path');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BASE_URL = process.env.BASE_URL; // e.g. https://wallet-t5vh.onrender.com
const WEBHOOK_URL = `${BASE_URL}/bot${TOKEN}`;

// === 1. Initialize Telegram bot (webhook mode) ===
const bot = new TelegramBot(TOKEN);
bot.setWebHook(WEBHOOK_URL);

console.log(`🔗 Webhook set to: ${WEBHOOK_URL}`);

// === 2. Handle Telegram webhook POST request ===
app.post(`/bot${TOKEN}`, (req, res) => {
  console.log('📥 Webhook received:', JSON.stringify(req.body, null, 2));
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// === 3. Respond to commands ===
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, '👋 Welcome! Choose an option:', {
    reply_markup: {
      inline_keyboard: [[
        { text: 'Ping', callback_data: 'ping' },
        { text: 'Status', callback_data: 'status' }
      ]]
    }
  });
});

bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  let response = '';
  let buttons = {
    reply_markup: {
      inline_keyboard: [[{ text: 'Main Menu', callback_data: 'main_menu' }]]
    }
  };

  if (data === 'ping') {
    response = '🏓 Pong! I’m awake.';
  } else if (data === 'status') {
    response = '✅ All systems operational.';
  } else if (data === 'main_menu') {
    response = '👋 Main Menu:';
    buttons = {
      reply_markup: {
        inline_keyboard: [[
          { text: 'Ping', callback_data: 'ping' },
          { text: 'Status', callback_data: 'status' }
        ]]
      }
    };
  }

  if (response) {
    bot.sendMessage(chatId, response, buttons);
  }

  bot.answerCallbackQuery(query.id);
});

// === 4. Dummy homepage ===
app.get('/', (req, res) => {
  res.send('✅ Webhook-based Telegram bot is live!');
});

// === 5. Start the Express server ===
app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});

// === 6. Start wallet monitor and Telegram CSV watcher ===
function startProcess(name, script) {
  const child = spawn('node', [path.join(__dirname, script)], {
    stdio: 'inherit',
    env: process.env,
  });

  child.on('close', (code) => {
    console.error(`❌ ${name} exited with code ${code}. Restarting in 5s...`);
    setTimeout(() => startProcess(name, script), 5000);
  });
}

startProcess('Wallet Monitor', 'new.js');
startProcess('Telegram CSV Watcher', 'telegram.js');
