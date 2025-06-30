require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { spawn } = require('child_process');
const path = require('path');

const app = express();
app.use(express.json()); // for JSON body parsing

const PORT = process.env.PORT || 3000;
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_URL = `${process.env.BASE_URL}/bot${TOKEN}`; // e.g. https://your-app.onrender.com/bot<token>

// Create bot in webhook mode
//const bot = new TelegramBot(TOKEN, { webHook: { port: PORT } });
const bot = new TelegramBot(TOKEN);
// Set webhook to your Render app URL
bot.setWebHook(WEBHOOK_URL);

// ADD THIS to forward webhook requests to the bot
app.post(`/bot${TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});


console.log(`🔗 Webhook set to: ${WEBHOOK_URL}`);

// Respond to basic commands
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
    response = '👋 Main Menu:', buttons = {
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

// Dummy home route for testing
app.get('/', (req, res) => {
  res.send('✅ Webhook-based Telegram bot is live!');
});


// === Start child scripts (new.js and telegram.js) ===
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

app.listen(PORT, () => {
  console.log(`🌐 Webhook server running on port ${PORT}`);
  bot.setWebHook(WEBHOOK_URL); // ✅ Safe to set webhook AFTER server is listening
});
