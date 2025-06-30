require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { spawn } = require('child_process');
const path = require('path');

const app = express();
app.use(express.json()); // Parse JSON for webhook updates

const PORT = process.env.PORT || 3000;
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_URL = `${process.env.BASE_URL}/bot${TOKEN}`;

// Initialize Telegram bot (no polling, webhook only)
const bot = new TelegramBot(TOKEN);

// 🔗 Forward webhook requests from Telegram to bot
app.post(`/bot${TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// 🟢 Basic web check route (for testing Render port binding)
app.get('/', (_req, res) => {
  console.log('Root route hit!');
  res.send('✅ Webhook-based Telegram bot is live!');
});

// Set webhook after server starts
app.listen(PORT, async () => {
  console.log(`🌐 Server listening on port ${PORT}`);
  try {
    await bot.setWebHook(WEBHOOK_URL);
    console.log(`📡 Webhook set to: ${WEBHOOK_URL}`);
  } catch (e) {
    console.error('❌ Failed to set webhook:', e.message);
  }
});

// Handle /start command
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

// Handle button clicks
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

// === Spawn monitor.js and telegram.js ===
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
