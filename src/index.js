require('dotenv').config();

const { startBot } = require('./bot');

(async () => {
  try {
    await startBot();
  } catch (err) {
    console.error('Failed to start bot:', err);
    process.exit(1);
  }
})();
