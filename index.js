const { spawn } = require('child_process');
const path = require('path');

function startScript(name, file) {
  const proc = spawn('node', [path.join(__dirname, file)], { stdio: 'inherit' });

  proc.on('exit', (code) => {
    console.error(`${name} exited with code ${code}. Restarting in 3s...`);
    setTimeout(() => startScript(name, file), 3000);
  });
}

startScript('Monitor', 'new.js');
startScript('Telegram', 'telegram.js');


// Render workaround: fake web server
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (_, res) => res.send('Bot is running.'));
app.listen(PORT, () => console.log(`✅ Web server running on port ${PORT}`));