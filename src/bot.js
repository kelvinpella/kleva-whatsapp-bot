const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

let client;

async function startBot() {
  client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { headless: true, args: ["--no-sandbox","--disable-setuid-sandbox"] }
  });

  client.on('qr', qr => {
    console.log('QR received — scan with your phone');
    qrcode.generate(qr, { small: true });
  });

  client.on('authenticated', () => console.log('Authenticated — session saved'));
  client.on('ready', () => console.log('Client ready'));
  client.on('disconnected', reason => console.log('Disconnected:', reason));
  client.on('error', err => console.error('Client error:', err));

  client.on('message', msg => {
    // placeholder: message processing will be implemented in later steps
    console.log('Message:', msg.body ? msg.body.slice(0, 200) : '<no body>');
  });

  await client.initialize();
}

async function stopBot() {
  if (client) await client.destroy();
}

module.exports = { startBot, stopBot };
