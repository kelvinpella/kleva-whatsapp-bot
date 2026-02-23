/**
 * WhatsApp Client Core Module
 * Handles WhatsApp Web client initialization and event management
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const config = require('../config');

let client = null;

/**
 * Initialize WhatsApp client with authentication
 * Uses LocalAuth (filesystem) in all environments.
 * On the VPS the .wwebjs_auth/ directory is kept alive by a Docker volume.
 * @returns {Promise<Client>} Initialized WhatsApp client
 */
async function initializeClient() {
  console.log('🤖 Initializing WhatsApp client...');

  // Configure Puppeteer arguments
  const puppeteerArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process',
    '--disable-web-security'
  ];

  if (config.nodeEnv === 'production') {
    puppeteerArgs.push('--disable-gpu');
  }

  // Use filesystem-based session storage — VPS has a persistent filesystem,
  // session data is kept alive via a Docker volume mounted at .wwebjs_auth/
  console.log('📂 Using LocalAuth (filesystem) for session storage');
  const authStrategy = new LocalAuth({ clientId: 'kleva-bot' });

  // Puppeteer configuration
  const puppeteerConfig = {
    headless: true,
    args: puppeteerArgs,
    timeout: 60000,
    protocolTimeout: 180000
  };

  // Use system Chromium in Docker/production
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    puppeteerConfig.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  // Create WhatsApp client
  client = new Client({
    authStrategy: authStrategy,
    puppeteer: puppeteerConfig,
    qrRefreshTimeout: 60000, // Wait 60 seconds before refreshing QR
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
    // Retry configuration to handle transient errors
    restartOnAuthFail: true
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

    // Output QR URL as a fallback when terminal rendering is poor
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

  // Loading screen event (WhatsApp Web is loading)
  client.on('loading_screen', (percent, message) => {
    console.log(`⏳ Loading: ${percent}% - ${message}`);
  });

  // Authentication failure event
  client.on('auth_failure', msg => {
    console.error('❌ Authentication failed:', msg);
  });

  // Error event
  client.on('error', error => {
    // Ignore navigation-related errors during initialization
    // These are common during page transitions and are not fatal
    if (error.message && (
      error.message.includes('Execution context was destroyed') ||
      error.message.includes('Target closed') ||
      error.message.includes('Protocol error')
    )) {
      console.log('⚠️  Ignoring navigation-related error during page transition');
      return;
    }

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
 * Wait for client to be fully ready and page to stabilize
 * @param {Client} client - WhatsApp client instance
 * @param {number} maxAttempts - Maximum number of attempts
 * @returns {Promise<boolean>} True if client is ready
 */
async function waitForClientReady(client, maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const state = await client.getState();
      if (state === 'CONNECTED') {
        console.log('✓ Client state verified: CONNECTED');
        return true;
      }
      console.log(`⏳ Client state: ${state}, waiting...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (err) {
      if (i === maxAttempts - 1) {
        console.log('⚠️  Could not verify client state, proceeding anyway...');
        return false;
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  return false;
}

/**
 * List all chats (groups and private) with retry logic
 * @param {Client} client - WhatsApp client instance
 * @param {Object} db - Database handler instance
 * @param {number} retries - Number of retries remaining
 * @param {number} delayMs - Delay between retries in milliseconds
 */
async function listChats(client, db, retries = 3, delayMs = 5000) {
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
    // Retry on execution context errors
    if (err.message && err.message.includes('Execution context was destroyed') && retries > 0) {
      console.log(`⚠️  Context error when listing chats, retrying in ${delayMs / 1000}s... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      return listChats(client, db, retries - 1, delayMs);
    }

    console.error('Error listing chats:', err.message || err);
    console.log('⚠️  Chat listing failed, but bot will continue to operate normally');
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
  waitForClientReady,
  listChats,
  destroyClient,
  getClient
};
