const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const input = require('input');

const apiId = 25105144;
const apiHash = '02b5c2c947f7eb230086d73a57d82379';
const stringSession = new StringSession('1BAAOMTQ5LjE1NC4xNjcuOTEAUGISVdV4D4/4KMJ/56JNoY6WAWan8iMYOlxFP7apW2srklzC/bQ/z+DJwB5ekkKwCUjUHb5+W/2sZrpxdzWgRPVKNnn8/pKzOSIgNHJPpNJRIip2xX+P16kffckZB7HmJytz6AtKqHjrkmLyP3Dgn+XwBBHIJQ4BemOWhEnKFBDVOFg03jcdVQTdwcx4rexFvI0Qmny7HEZoDEUjIBNZa2HmIyLpU4eJYmRH6ylgUIRhjSXUrfOxIrqyCOuehhnvo3DaqjVSePWlT8EqA/pAaXsSXUfogpQpO4e7NCz4ziqYEhx8jKtqGi2aEqQ75zn+6n3486WOSk9Eh2km6gLUKGM='); // Replace with your real session

const client = new TelegramClient(stringSession, apiId, apiHash, {
  connectionRetries: 5,
});

(async () => {
  await client.start();

  const usernames = [
    //'https://t.me/dexssignal',     // ← replace with your channel usernames or invite links
   // 'https://t.me/GemPadPresaleAlerts',
   // 'https://t.me/CryptoWolvesCall',
    //'https://t.me/CallAnalyserBSC',
    //'https://t.me/PinkSaleTracking',
   // 'https://t.me/bschousesignal',
   // 'https://t.me/SUbsccalls'  
      'https://t.me/SUalphacalls'   // can also be t.me/ links
  ];

  for (const name of usernames) {
    try {
      const entity = await client.getEntity(name);
      console.log(`✅ ${name} → channelId: ${entity.id}`);
    } catch (e) {
      console.log(`❌ Failed to resolve ${name}:`, e.message);
    }
  }

  process.exit(0);
})();
