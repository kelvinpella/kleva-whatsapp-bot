const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const SupabaseHandler = require('./src/supabaseDb');
const config = require('./src/config');
const { handleGroupMessage, handlePrivateMessage } = require('./src/handlers/messageHandler');

let client;
let db;

async function startBot() {
    try {
        // Initialize database
        db = new SupabaseHandler();

        // Configure WhatsApp client
        const puppeteerArgs = [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage'
        ];

        if (config.nodeEnv === 'production') {
            puppeteerArgs.push('--disable-gpu');
        }

        client = new Client({
            authStrategy: new LocalAuth({ clientId: 'kleva-bot' }),
            puppeteer: {
                headless: true,
                args: puppeteerArgs,
                timeout: 60000
            }
        });

        // Event handlers
        client.on('qr', qr => {
            console.log('\n📱 QR Code received — scan with WhatsApp on your phone:\n');
            qrcode.generate(qr, { small: true });

            // Also output QR code URL for generating image online
            console.log('\n🔗 Alternative: Generate QR image at:');
            console.log(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`);
            console.log('\nOpen this URL in your browser, then scan the QR image with WhatsApp.\n');
        });

        client.on('authenticated', () => {
            console.log('✓ Authentication successful! Session is being saved...');
        });

        client.on('ready', () => {
            console.log('✓ Client is ready and session is persisted!');
            console.log(`📊 Monitoring ${config.supplierGroupIds.length} supplier groups\n`);
        });

        client.on('disconnected', reason => {
            console.log(`⚠️  Client disconnected: ${reason}`);
        });

        client.on('error', error => {
            console.error(`❌ Client error: ${error.message}`);
        });

        client.on('message', async msg => {
            try {
                // Check if message is from a group
                // Use chat.isGroup for reliability (msg.isGroup can be unreliable)
                const chat = await msg.getChat();
                
                if (chat.isGroup) {
                    console.log(`\n📨 New message from ${msg.from}: ${msg.body?.substring(0, 50) || '(media)'}...`);
                    // Route to group message handler (image processing)
                    await handleGroupMessage(msg, db, client);
                } else {
                    // Route to private message handler (search queries, commands)
                    await handlePrivateMessage(msg, db, client);
                }
            } catch (err) {
                console.error('Error handling message:', err);
            }
        });

        // Initialize client
        await client.initialize();
        console.log('✓ WhatsApp bot initialized successfully\n');
    } catch (err) {
        console.error('Failed to initialize bot:', err.message);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down gracefully...');

    try {
        if (db) {
            await db.close();
        }

        if (client) {
            await client.destroy();
        }

        console.log('✓ Shutdown complete');
        process.exit(0);
    } catch (err) {
        console.error('Error during shutdown:', err);
        process.exit(1);
    }
});

// Start the bot
startBot();
