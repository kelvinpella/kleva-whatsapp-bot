/**
 * Message Handler
 * Processes incoming WhatsApp messages and routes them to appropriate handlers
 * 
 * Requirements implemented:
 * 1. Only save images from supplier groups (not private chats)
 * 2. Max 2 images per message (skip rest)
 * 3. No prices with images (prices are in separate text messages)
 * 4. Associate with group_id, date_posted
 */

const { processGroupImages, shouldProcessMessage } = require('../utils/imageProcessor');
const config = require('../config');

const MAX_IMAGES_PER_MESSAGE = 2;
const BATCH_WINDOW_SECONDS = 30;

// Per-group queue: process messages one at a time so batch limit works
const groupQueues = new Map();

// Tracks images saved per batch (group_author_timeWindow)
const batchImageCount = new Map();

function getBatchKey(groupId, author, timestamp) {
  const tsSec = timestamp > 1e12 ? Math.floor(timestamp / 1000) : timestamp;
  const window = Math.floor(tsSec / BATCH_WINDOW_SECONDS) * BATCH_WINDOW_SECONDS;
  return `${groupId}_${author || 'unknown'}_${window}`;
}

async function runWithGroupLock(groupId, fn) {
  let queue = groupQueues.get(groupId);
  if (!queue) {
    queue = Promise.resolve();
    groupQueues.set(groupId, queue);
  }
  const next = queue.then(() => fn()).finally(() => {});
  groupQueues.set(groupId, next);
  return next;
}

function tryReserveSlot(groupId, author, timestamp) {
  const key = getBatchKey(groupId, author, timestamp);
  const count = (batchImageCount.get(key) || 0) + 1;
  batchImageCount.set(key, count);
  if (count === 1) {
    setTimeout(() => batchImageCount.delete(key), (BATCH_WINDOW_SECONDS + 5) * 1000);
  }
  return count <= MAX_IMAGES_PER_MESSAGE;
}

/**
 * Handle incoming group messages
 * - Detects and processes images from supplier groups
 * - Validates handbags with COCO-SSD
 * - Saves to database with metadata
 *
 * @param {Object} msg - WhatsApp message
 * @param {Object} db - Supabase database handler
 * @param {Object} client - WhatsApp client
 */
async function handleGroupMessage(msg, db, client) {
  const groupId = msg.from; // Use message.from (more reliable)
  
  try {
    // Get accurate group name from chat object
    const chat = await msg.getChat();
    const groupName = chat.name || msg.groupMetadata?.subject || 'Unknown Group';
    
    console.log(`\n📨 Received message in group: ${groupName} (${groupId})`);
    // Check if this message should be processed for images
    const shouldProcess = shouldProcessMessage(msg, config.supplierGroupIds);

    if (!shouldProcess) {
      return; // Skip non-qualifying messages
    }

    // Message has media - process images (sequential per group so limit is enforced)
    if (msg.hasMedia) {
      const author = msg.author || msg.from;

      await runWithGroupLock(groupId, async () => {
        if (!tryReserveSlot(groupId, author, msg.timestamp)) {
          console.log(`\n⏭️ Skipping image (max ${MAX_IMAGES_PER_MESSAGE} per message/album)`);
          return;
        }

        console.log(`\n📸 Processing images from ${groupName}...`);

        // Download all media from message
        const mediaList = [];
        try {
          if (msg.hasQuotedMsg) {
            // Handle quoted images if applicable
          } else {
            const media = await msg.downloadMedia();
            if (media) mediaList.push(media);
          }
        } catch (err) {
          console.error('Error downloading media:', err.message);
          return;
        }

        if (mediaList.length === 0) return;

        const processedImages = await processGroupImages(msg, mediaList, db, groupName);
        if (processedImages.length === 0) {
          console.log('⏭️  No valid handbag images found in message');
          return;
        }

        for (const imgData of processedImages) {
          try {
            console.log(`💾 Saving image to database (${imgData.groupName})...`);
            await db.insertProduct({
              uuid: imgData.uuid,
              groupId: imgData.groupId,
              groupName: imgData.groupName,
              imagePath: imgData.imagePath,
              imageUrl: imgData.imageUrl || null,
              thumbnailPath: imgData.thumbnailPath,
              thumbnailUrl: imgData.thumbnailUrl || null,
              caption: null,
              price: null,
              currency: null,
              brand: null,
              bagType: null,
              embedding: imgData.embedding,
              embeddingHash: imgData.embeddingHash,
              messageTimestamp: imgData.messageTimestamp,
              metadata: {
                confidence: imgData.confidence,
                detectedObjects: imgData.detectedObjects,
                fileSize: imgData.fileSize,
                dimensions: imgData.dimensions
              }
            });
            console.log(`✅ Image saved: ${imgData.groupName} (${imgData.dimensions})`);
          } catch (err) {
            console.error('Error saving image to database:', err.message);
          }
        }

        try {
          await db.updateGroupProductCount(groupId);
          await db.updateStats();
        } catch (err) {
          console.error('Error updating stats:', err.message);
        }
      });
    }
  } catch (err) {
    console.error('Error handling group message:', err.message);
  }
}

/**
 * Handle incoming private messages
 * - Used for image search queries (Phase 3)
 * - Commands: /help, /stats, search by image
 * - Requirement: Images from private chats are NOT saved to database
 *
 * @param {Object} msg - WhatsApp message
 * @param {Object} db - Supabase database handler
 * @param {Object} client - WhatsApp client
 */
async function handlePrivateMessage(msg, db, client) {
  try {
    const fromNumber = msg.from;

    // Check for commands
    if (msg.body && msg.body.startsWith('/')) {
      const command = msg.body.substring(1).toLowerCase().split(' ')[0];

      switch (command) {
        case 'help':
          await msg.reply(
            '🤖 *Handbag Search Bot*\n\n' +
            '📸 Send an image to search for similar handbags\n' +
            '/stats - View database statistics\n' +
            'Private messages are used for searching only - not indexed'
          );
          break;

        case 'stats':
          const stats = await db.getStats();
          if (stats) {
            await msg.reply(
              '📊 *Database Statistics*\n\n' +
              `Total Products: ${stats.total_products}\n` +
              `Supplier Groups: ${stats.total_groups}\n` +
              `Search Queries: ${stats.total_searches}\n` +
              `Last Updated: ${new Date(stats.last_updated * 1000).toLocaleString()}`
            );
          }
          break;

        default:
          await msg.reply('Unknown command. Type /help for available commands.');
      }
    }

    // Requirement 1: Images from private chats are NOT saved
    if (msg.hasMedia) {
      console.log(`🔍 Image query from ${fromNumber} (not indexed, searching only)`);
      // Phase 3: Handle image search
      // Images from private chats are processed for search, not saved to database
    }
  } catch (err) {
    console.error('Error handling private message:', err.message);
  }
}

module.exports = { handleGroupMessage, handlePrivateMessage };

