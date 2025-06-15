require('dotenv').config();
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');

const apiId = parseInt(process.env.API_ID);    //25105144;
const apiHash = process.env.API_HASH;   //'02b5c2c947f7eb230086d73a57d82379';
const stringSession = new StringSession(fs.readFileSync('./session.txt', 'utf-8').trim());
//const TELEGRAM_BOT_TOKEN = '7860048597:AAGv1eEree3HniaSlDDJiJl8fV6dWc2Ohk4';
const TELEGRAM_CHAT_IDS = process.env.TELEGRAM_CHAT_IDS.split(',').map(id => isNaN(id) ? id : parseInt(id)); /*[
  '@addstests',
  -1002632426236,
  '931029411'
];*/

const CSV_FILE = path.join(__dirname, 'logs.csv');
const POLL_INTERVAL = 3000;

let lastLineCount = 0;

const client = new TelegramClient(stringSession, apiId, apiHash, {
  connectionRetries: 5,
  timeout: 20000,
});

(async () => {
  await client.start();
  console.log("✅ Telegram client started");
  console.log("✅ Logged in as user");
  console.log("🔐 Session string:\n", client.session.save());

    // Save session to disk
  fs.writeFileSync('session.txt', client.session.save());
  
  // Function to send message via user session
  async function sendMessageToAllChats(text) {
    for (const chatId of TELEGRAM_CHAT_IDS) {
      try {
        await client.sendMessage(chatId, {
          message: text,
          parseMode: 'markdown',
        });
        console.log(`✅ Sent to ${chatId}`);
      } catch (err) {
        console.error(`❌ Failed to send to ${chatId}:`, err.message);
      }
    }
  }

  // Monitor CSV for new rows
  async function checkCSV() {
    try {
      const lines = fs.readFileSync(CSV_FILE, 'utf-8').trim().split('\n');
      if (lines.length <= lastLineCount) return;
      
      const newLines = lines.slice(lastLineCount);
      lastLineCount = lines.length;

      for (const line of newLines) {
        if (line.startsWith('Timestamp')) continue;
       const [timestamp, buyer, token, tokenName, recipient, txHash, dexscreenerUrl] = line.split('","').map(s => s.replace(/^"|"$/g, ''));

        const msg = `🚨 *Token Buy Detected!*\n\n🕒 Time: \`${timestamp}\`\n👤 Buyer: \`${buyer}\`\n🎯 Token: \`${tokenName}\`\n📦 Token Address: \`${token}\`\n📥 Recipient: \`${recipient}\`\n🔗 [View Tx](https://bscscan.com/tx/${txHash}) '\n📊 [Dexscreener Chart] (https://dexscreener.com/bsc/${token})`;
        await sendMessageToAllChats(msg);
      }
    } catch (e) {
      console.error('❌ CSV Error:', e.message);
    }
  }

  console.log('📡 Watching logs.csv for new wallet activity...');
  setInterval(checkCSV, POLL_INTERVAL);
})();
