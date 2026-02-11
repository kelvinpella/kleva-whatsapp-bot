/**
 * Main Entry Point
 * WhatsApp Image Search Bot with TikTok Auto-Upload
 */

require('dotenv').config();

const { initializeClient, setupEventHandlers, startClient, listChats, destroyClient } = require('./core/whatsapp');
const DatabaseHandler = require('./core/database');
const { handleGroupMessage, handlePrivateMessage } = require('./features/imageSearch/handlers/messageHandler');

let client = null;
let db = null;

/**
 * Start the bot
 */
async function startBot() {
  try {
    console.log('🚀 Starting Kleva WhatsApp Bot...\n');

    // Initialize database
    db = new DatabaseHandler();

    // Initialize WhatsApp client
    client = await initializeClient();

    // Set up event handlers
    setupEventHandlers(client, {
      onReady: async () => {
        // List all chats when ready
        await listChats(client, db);
      },
      onMessage: async (msg) => {
        // Route messages based on type (group vs private)
        const chat = await msg.getChat();

        if (chat.isGroup) {
          // Group message - handle image indexing or TikTok upload
          await handleGroupMessage(msg, db, client);
        } else {
          // Private message - handle search queries
          await handlePrivateMessage(msg, db, client);
        }
      },
      onDisconnected: (reason) => {
        console.log(`⚠️  Disconnected: ${reason}`);
      },
      onError: (error) => {
        console.error(`❌ Error: ${error.message}`);
      }
    });

    // Start the client
    await startClient(client);

    console.log('✅ Bot is running!\n');
  } catch (err) {
    console.error('Failed to start bot:', err);
    process.exit(1);
  }
}

/**
 * Graceful shutdown handler
 */
async function shutdown() {
  console.log('\n🛑 Shutting down gracefully...');

  try {
    // Close database connection
    if (db && db.close) {
      await db.close();
    }

    // Destroy WhatsApp client
    if (client) {
      await destroyClient(client);
    }

    console.log('✓ Shutdown complete');
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  shutdown();
});

// Start the bot
startBot();
