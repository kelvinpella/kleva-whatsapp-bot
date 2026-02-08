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
        // Download media first to check type BEFORE reserving slot
        const mediaList = [];
        try {
          if (msg.hasQuotedMsg) {
            // Handle quoted images if applicable
          } else {
            const media = await msg.downloadMedia();
            if (media) {
              // Check if it's an image (not video) before proceeding
              if (!media.mimetype || !media.mimetype.startsWith('image/')) {
                console.log(`\n⏭️ Skipping non-image media (${media.mimetype})`);
                return; // Don't waste a slot on videos
              }
              mediaList.push(media);
            }
          }
        } catch (err) {
          console.error('Error downloading media:', err.message);
          return;
        }

        if (mediaList.length === 0) return;

        // Now reserve slot only for valid images
        if (!tryReserveSlot(groupId, author, msg.timestamp)) {
          console.log(`\n⏭️ Skipping image (max ${MAX_IMAGES_PER_MESSAGE} per message/album)`);
          return;
        }

        console.log(`\n📸 Processing images from ${groupName}...`);

        const processedImages = await processGroupImages(msg, mediaList, db, groupName);
        if (processedImages.length === 0) {
          console.log('⏭️  No valid handbag images found in message');
          return;
        }

        // Safety check: Enforce max 2 images per album at save time
        const imagesToSave = processedImages.slice(0, MAX_IMAGES_PER_MESSAGE);
        if (processedImages.length > imagesToSave.length) {
          console.log(`⚠️ Limiting to ${MAX_IMAGES_PER_MESSAGE} images (${processedImages.length} processed, ${processedImages.length - imagesToSave.length} dropped)`);
        }

        for (const imgData of imagesToSave) {
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

// Track search album batches (similar to group image batching)
const searchBatchWindow = new Map(); // Tracks if we're in a search batch
const searchBatchResults = new Map(); // Tracks product UUIDs already returned in batch (for deduplication)
const searchBatchCount = new Map(); // Tracks number of images processed in batch
const SEARCH_BATCH_TIMEOUT = 3000; // 3 second window for album images

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
            '🤖 *Bot ya Kutafuta Mikoba*\n\n' +
            '📸 Tuma picha na /search ili kutafuta mikoba inayofanana\n' +
            '/stats - Angalia takwimu za database\n' +
            'Ujumbe wa binafsi unatumika kutafuta tu - hauhifadhiwi'
          );
          break;

        case 'stats':
          const stats = await db.getStats();
          if (stats) {
            await msg.reply(
              '📊 *Takwimu za Database*\n\n' +
              `Jumla ya Bidhaa: ${stats.total_products}\n` +
              `Vikundi vya Wasambazaji: ${stats.total_groups}\n` +
              `Utafutaji: ${stats.total_searches}\n` +
              `Imesasishwa: ${new Date(stats.last_updated * 1000).toLocaleString()}`
            );
          }
          break;

        case 'search':
          // /search is handled separately below (requires image)
          break;

        default:
          await msg.reply('Amri haijulikani. Andika /help kuona amri zinazopatikana.');
      }
    }

    // Phase 3: Image search - supports album search
    const hasSearchCommand = msg.body && msg.body.toLowerCase().includes('/search');
    const hasImage = msg.hasMedia;

    // Check if we're in an active search batch (album search)
    const batchKey = `search_${fromNumber}`;
    const inSearchBatch = searchBatchWindow.has(batchKey);

    if (hasSearchCommand && hasImage) {
      // First image in album with /search - start batch window
      console.log(`🔍 Image search query from ${fromNumber} (starting album batch)`);

      // Initialize results tracking for deduplication
      if (!searchBatchResults.has(batchKey)) {
        searchBatchResults.set(batchKey, new Set());
      }
      const resultsSent = searchBatchResults.get(batchKey);

      // Initialize image counter for this batch
      if (!searchBatchCount.has(batchKey)) {
        searchBatchCount.set(batchKey, 0);
      }
      const imageNumber = searchBatchCount.get(batchKey) + 1;
      searchBatchCount.set(batchKey, imageNumber);

      // Mark search batch as active for this user
      if (searchBatchWindow.has(batchKey)) {
        clearTimeout(searchBatchWindow.get(batchKey));
      }
      const timeout = setTimeout(() => {
        searchBatchWindow.delete(batchKey);
        searchBatchResults.delete(batchKey); // Clean up results tracking
        searchBatchCount.delete(batchKey); // Clean up count tracking
        console.log(`⏱️ Search batch window closed for ${fromNumber}`);
      }, SEARCH_BATCH_TIMEOUT);
      searchBatchWindow.set(batchKey, timeout);

      // Perform search with deduplication and image number
      const { performImageSearch } = require('./searchHandler');
      await performImageSearch(msg, db, client, resultsSent, imageNumber);
    } else if (hasImage && !hasSearchCommand && inSearchBatch) {
      // Subsequent images in album (no caption, but in search batch)
      console.log(`🔍 Album image ${msg.timestamp} - searching (batch active)`);

      // Get existing results set for deduplication
      const resultsSent = searchBatchResults.get(batchKey) || new Set();

      // Increment image counter
      const imageNumber = (searchBatchCount.get(batchKey) || 0) + 1;
      searchBatchCount.set(batchKey, imageNumber);

      // Extend batch window
      clearTimeout(searchBatchWindow.get(batchKey));
      const timeout = setTimeout(() => {
        searchBatchWindow.delete(batchKey);
        searchBatchResults.delete(batchKey); // Clean up results tracking
        searchBatchCount.delete(batchKey); // Clean up count tracking
        console.log(`⏱️ Search batch window closed for ${fromNumber}`);
      }, SEARCH_BATCH_TIMEOUT);
      searchBatchWindow.set(batchKey, timeout);

      // Perform search with deduplication and image number
      const { performImageSearch } = require('./searchHandler');
      await performImageSearch(msg, db, client, resultsSent, imageNumber);
    } else if (hasSearchCommand && !hasImage) {
      await msg.reply('❌ Tafadhali tuma picha na amri ya /search ili kutafuta mkoba.');
    } else if (hasImage && !hasSearchCommand && !inSearchBatch) {
      // Image without /search command and not in batch - ignore
      console.log(`📸 Image received without /search command - ignoring`);
    }
  } catch (err) {
    console.error('Error handling private message:', err.message);
  }
}

module.exports = { handleGroupMessage, handlePrivateMessage };

