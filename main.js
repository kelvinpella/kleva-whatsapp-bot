const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { 
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
        headless: true
    }
});

// Fired when QR code is generated or changes
client.on('qr', qr => {
    console.log('QR code received. Scan it with your phone...');
    qrcode.generate(qr, { small: true });
});

// Fired when authentication is successful
client.on('authenticated', () => {
    console.log('✓ Authentication successful! Session is being saved...');
});

// Fired when client becomes ready
client.on('ready', () => {
    console.log('✓ Client is ready and session is persisted!');
});

// Fired when client is disconnected
client.on('disconnected', (reason) => {
    console.log('Client was disconnected:', reason);
});

// Fired on incoming messages
client.on('message', message => {
    console.log('Message received:', message.body);
});

// Error handling
client.on('error', error => {
    console.error('Client error:', error);
});

// Initialize client
client.initialize().catch(err => {
    console.error('Failed to initialize client:', err);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down gracefully...');
    await client.destroy();
    process.exit(0);
});
