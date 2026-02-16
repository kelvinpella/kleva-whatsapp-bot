/**
 * Main Entry Point
 * WhatsApp Bot with TikTok Auto-Upload
 */

require('dotenv').config();

const { initializeClient, setupEventHandlers, startClient, listChats, destroyClient } = require('./core/whatsapp');
const DatabaseHandler = require('./core/database');
const { handleGroupMessage } = require('./handlers/groupMessageHandler');
const { initializeWorker } = require('./workers/unreadGroupMessagesWorker');

let client = null;
let db = null;
let worker = null;

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
        console.log('✅ Client ready!');

        try {
          // Wait longer for page to fully settle
          console.log('⏳ Waiting for WhatsApp Web to fully load...');
          await new Promise(resolve => setTimeout(resolve, 10000)); // Increase to 10 seconds

          console.log('📋 Fetching chats...');
          await listChats(client, db);

          console.log('🔧 Initializing message queue worker...');
          worker = initializeWorker(client, db);

        } catch (error) {
          // Handle navigation/context errors gracefully
          if (
            error.message?.includes('Execution context was destroyed') ||
            error.message?.includes('Target closed') ||
            error.message?.includes('Navigation')
          ) {
            console.log('⚠️ Navigation error while listing chats - will retry');

            // Retry after another delay
            setTimeout(async () => {
              try {
                await listChats(client, db);
                console.log('✅ Chats listed successfully on retry');
              } catch (retryError) {
                console.error('❌ Failed to list chats on retry:', retryError.message);
                // Continue anyway - not critical for bot operation
              }
            }, 5000);
          } else {
            console.error('❌ Error in onReady handler:', error.message);
          }

          // Initialize worker anyway - don't block bot operation
          console.log('🔧 Initializing message queue worker...');
          worker = initializeWorker(client, db);
        }
      },
      onMessage: async (msg) => {
        // Route messages based on type (group vs private)
        const chat = await msg.getChat();

        if (chat.isGroup) {
          // Group message - handle TikTok upload
          await handleGroupMessage(msg, db, client);
        } else {
          // Private messages not supported
          console.log('Received private message - not supported');
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
    // Close BullMQ worker
    if (worker) {
      console.log('Closing worker...');
      await worker.close();
    }

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
