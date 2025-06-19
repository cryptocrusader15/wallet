require('dotenv').config();
const express = require('express');
const { spawn } = require('child_process');
const path = require('path');

// === Start dummy Express server for Render ===
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (_req, res) => {
  res.send('✅ Wallet monitor and Telegram bot are running');
});

setInterval(() => {
  console.log(`[KEEPALIVE] ${new Date().toISOString()}`);
}, 10 * 60 * 1000); // Log every 10 min to prevent Render sleep

app.listen(PORT, () => {
  console.log(`🌐 Dummy server listening on port ${PORT}`);
});

// === Auto-restart function ===
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

// === Start monitor.js and telegram.js ===
startProcess('Monitor', 'new.js');
startProcess('Telegram', 'telegram.js');
