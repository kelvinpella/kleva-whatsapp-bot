const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const DatabaseHandler = require('./db');
const config = require('./config');

let client;
let db;

/**
 * Initialize and start the WhatsApp bot
 */
async function startBot() {
  console.log('🤖 Starting WhatsApp bot...');

  // Initialize database
  db = new DatabaseHandler();
  console.log('✓ Database initialized');

  // Configure WhatsApp client
  const puppeteerArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage'
  ];

  if (process.env.NODE_ENV === 'production') {
    puppeteerArgs.push('--disable-gpu');
  }

  client = new Client({
    authStrategy: new LocalAuth({ clientId: 'kleva-bot' }),
    puppeteer: {
      headless: true,
      args: puppeteerArgs,
      timeout: 60000
    },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
  });

  // Event: QR Code for login
  client.on('qr', qr => {
    console.log('\n📱 QR Code received — scan with WhatsApp on your phone:\n');
    qrcode.generate(qr, { small: true });
  });

  // Event: Authentication successful
  client.on('authenticated', () => {
    console.log('✓ Authentication successful! Session is being saved...');
  });

  // Event: Client ready and connected
  client.on('ready', () => {
    console.log('✓ Client is ready and session is persisted!');
    listChats();
  });

  // Event: Client disconnected
  client.on('disconnected', reason => {
    console.log('⚠️  Client disconnected:', reason);
  });

  // Event: Client error
  client.on('error', error => {
    console.error('❌ Client error:', error.message);
  });

  // Event: Incoming message
  client.on('message', async msg => {
    try {
      await handleIncomingMessage(msg);
    } catch (err) {
      console.error('Error handling message:', err);
    }
  });

  // Initialize client
  try {
    await client.initialize();
    console.log('✓ WhatsApp bot initialization complete');
  } catch (err) {
    console.error('❌ Failed to initialize client:', err.message);
    throw err;
  }
}

/**
 * List all chats and extract group information
 */
async function listChats() {
  try {
    const chats = await client.getChats();
    const groups = chats.filter(chat => chat.isGroup);

    console.log(`\n📊 Found ${groups.length} WhatsApp groups:\n`);
    groups.forEach((group, idx) => {
      console.log(`${idx + 1}. ${group.name} (${group.id.user})`);

      // Insert into database
      db.insertSupplierGroup(group.id.user, group.name);
    });

    if (groups.length === 0) {
      console.log('ℹ️  No groups found. Make sure you added the bot to group chats.');
    }

    console.log('\n💡 Configure SUPPLIER_GROUP_IDS in .env with the group IDs above\n');
  } catch (err) {
    console.error('Error listing chats:', err);
  }
}

/**
 * Handle incoming WhatsApp messages
 * Route to appropriate handler based on message type and sender
 */
async function handleIncomingMessage(msg) {
  const { body, from, isGroup, type } = msg;

  // Log message meta
  if (type === 'image' || type === 'document' || body) {
    console.log(`📨 Message from ${from}: type=${type}, hasMedia=${msg.hasMedia}`);
  }

  // Ignore group messages for now
  // (Will implement group monitoring in later steps)
  if (isGroup) {
    return;
  }

  // Handle image messages (search requests)
  if (type === 'image' && msg.hasMedia) {
    console.log('🖼️  Image received for search');
    // Placeholder: Will implement image search handler in Phase 3
    await msg.reply('Image search feature coming soon! 🔄');
    return;
  }

  // Handle text commands
  if (body) {
    const command = body.toLowerCase().trim();

    if (command === '/help') {
      await msg.reply(
        `🤖 *Handbag Image Search Bot*\n\n` +
        `Send an image to search for similar bags.\n\n` +
        `Available commands:\n` +
        `/stats - Show indexed bag count\n` +
        `/help - Show this message`
      );
      return;
    }

    if (command === '/stats') {
      const stats = db.getStats();
      await msg.reply(
        `📊 *Bot Statistics*\n\n` +
        `Bags indexed: ${stats?.total_products || 0}\n` +
        `Supplier groups: ${stats?.total_groups || 0}\n` +
        `Searches performed: ${stats?.total_searches || 0}`
      );
      return;
    }
  }
}

/**
 * Get client instance
 */
function getClient() {
  return client;
}

/**
 * Get database instance
 */
function getDatabase() {
  return db;
}

/**
 * Gracefully stop the bot
 */
async function stopBot() {
  console.log('\n🛑 Shutting down bot gracefully...');

  try {
    if (db) {
      db.vacuum();
      db.close();
      console.log('✓ Database closed');
    }

    if (client) {
      await client.destroy();
      console.log('✓ WhatsApp client destroyed');
    }

    console.log('✓ Bot shutdown complete');
  } catch (err) {
    console.error('Error during shutdown:', err);
  }
}

module.exports = { startBot, stopBot, getClient, getDatabase };
