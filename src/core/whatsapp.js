/**
 * WhatsApp Client Core Module
 * Handles WhatsApp Web client initialization and event management
 */

const { Client, LocalAuth, RemoteAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const config = require('../config');
const RedisStore = require('./RedisStore');

let client = null;

/**
 * Initialize WhatsApp client with authentication
 * Uses Redis-based auth for Railway (when REDIS_URL is set)
 * Uses filesystem-based auth for local development
 * @returns {Promise<Client>} Initialized WhatsApp client
 */
async function initializeClient() {
  console.log('🤖 Initializing WhatsApp client...');

  // Configure Puppeteer arguments
  const puppeteerArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage'
  ];

  if (config.nodeEnv === 'production') {
    puppeteerArgs.push('--disable-gpu');
  }

  // Choose auth strategy based on environment
  let authStrategy;
  if (process.env.REDIS_URL) {
    // Production (Railway): Use Redis-based session storage with RemoteAuth
    console.log('📦 Using RemoteAuth (Redis) for session persistence');
    const redisStore = new RedisStore();
    authStrategy = new RemoteAuth({
      clientId: 'kleva-bot',
      store: redisStore,
      backupSyncIntervalMs: 60000 // Sync every minute
    });
  } else {
    // Local development: Use filesystem-based session storage
    console.log('📂 Using LocalAuth (filesystem) for session storage');
    authStrategy = new LocalAuth({ clientId: 'kleva-bot' });
  }

  // Create WhatsApp client
  client = new Client({
    authStrategy: authStrategy,
    puppeteer: {
      headless: true,
      args: puppeteerArgs,
      timeout: 60000,
      protocolTimeout: 120000 // Increase protocol timeout to 2 minutes for Railway
    },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
  });

  return client;
}

/**
 * Set up WhatsApp client event handlers
 * @param {Client} client - WhatsApp client instance
 * @param {Object} handlers - Event handler callbacks
 */
function setupEventHandlers(client, handlers = {}) {
  // QR Code event
  client.on('qr', qr => {
    console.log('\n📱 QR Code received — scan with WhatsApp on your phone:\n');
    qrcode.generate(qr, { small: true });

    // Also output QR code URL for generating image online (useful for Railway)
    console.log('\n🔗 Alternative: Generate QR image at:');
    console.log(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`);
    console.log('\nOpen this URL in your browser, then scan the QR image with WhatsApp.\n');
  });

  // Authentication successful
  client.on('authenticated', () => {
    console.log('✓ Authentication successful! Session is being saved...');
  });

  // Client ready
  client.on('ready', () => {
    console.log('✓ Client is ready and session is persisted!');
    console.log(`📊 Monitoring ${config.supplierGroupIds.length} supplier groups\n`);

    // Call ready handler if provided
    if (handlers.onReady) {
      handlers.onReady(client);
    }
  });

  // Disconnection event
  client.on('disconnected', reason => {
    console.log(`⚠️  Client disconnected: ${reason}`);

    if (handlers.onDisconnected) {
      handlers.onDisconnected(reason);
    }
  });

  // Error event
  client.on('error', error => {
    console.error(`❌ Client error: ${error.message}`);

    if (handlers.onError) {
      handlers.onError(error);
    }
  });

  // Message event
  if (handlers.onMessage) {
    client.on('message', async msg => {
      try {
        await handlers.onMessage(msg, client);
      } catch (err) {
        console.error('Error handling message:', err);
      }
    });
  }

  console.log('✓ Event handlers configured');
}

/**
 * Start the WhatsApp client
 * @param {Client} client - WhatsApp client instance
 */
async function startClient(client) {
  try {
    await client.initialize();
    console.log('✓ WhatsApp client initialized successfully\n');
    return client;
  } catch (err) {
    console.error('❌ Failed to initialize client:', err.message);
    throw err;
  }
}

/**
 * List all chats (groups and private)
 * @param {Client} client - WhatsApp client instance
 * @param {Object} db - Database handler instance
 */
async function listChats(client, db) {
  try {
    const chats = await client.getChats();
    const groups = chats.filter(chat => chat.isGroup);

    console.log(`\n📊 Found ${groups.length} WhatsApp groups:\n`);

    for (const [idx, group] of groups.entries()) {
      console.log(`${idx + 1}. ${group.name} (${group.id.user})`);

      // Insert into database
      if (db && db.insertSupplierGroup) {
        await db.insertSupplierGroup(group.id.user, group.name);
      }
    }

    if (groups.length === 0) {
      console.log('ℹ️  No groups found. Make sure you added the bot to group chats.');
    }

    console.log('\n💡 Configure SUPPLIER_GROUP_IDS in .env with the group IDs above\n');
  } catch (err) {
    console.error('Error listing chats:', err);
  }
}

/**
 * Gracefully destroy the WhatsApp client
 * @param {Client} client - WhatsApp client instance
 */
async function destroyClient(client) {
  if (client) {
    try {
      await client.destroy();
      console.log('✓ WhatsApp client destroyed');
    } catch (err) {
      console.error('Error destroying client:', err);
    }
  }
}

/**
 * Get the current client instance
 * @returns {Client|null} Current WhatsApp client instance
 */
function getClient() {
  return client;
}

module.exports = {
  initializeClient,
  setupEventHandlers,
  startClient,
  listChats,
  destroyClient,
  getClient
};
