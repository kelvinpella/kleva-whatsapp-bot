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

    // Message has media - process images
    if (msg.hasMedia) {
      console.log(`\n📸 Processing images from ${groupName}...`);

      // Download all media from message
      const mediaList = [];
      try {
        // WhatsApp Web JS doesn't directly provide media array
        // For now, we process the single message media
        // In Phase 2, we'll handle multiple images per message properly
        if (msg.hasQuotedMsg) {
          // Handle quoted images if applicable
        } else {
          // Get the media from this message
          const media = await msg.downloadMedia();
          if (media) {
            mediaList.push(media);
          }
        }
      } catch (err) {
        console.error('Error downloading media:', err.message);
        return;
      }

      if (mediaList.length === 0) {
        return;
      }

      // Process images with validation (pass groupName from chat)
      const processedImages = await processGroupImages(msg, mediaList, db, groupName);

      if (processedImages.length === 0) {
        console.log('⏭️  No valid handbag images found in message');
        return;
      }

      // Save each validated image to database
      for (const imgData of processedImages) {
        try {
          console.log(`💾 Saving image to database (${imgData.groupName})...`);

          // Requirement 4: Save with group_id and date_posted
          await db.insertProduct({
            uuid: `${imgData.groupId}_${imgData.messageTimestamp}`,
            groupId: imgData.groupId,
            groupName: imgData.groupName,
            imagePath: imgData.imagePath,
            imageUrl: imgData.imageUrl || null,
            thumbnailPath: imgData.thumbnailPath,
            thumbnailUrl: imgData.thumbnailUrl || null,
            caption: null, // Requirement 3: No prices, only images
            price: null, // Requirement 3: No price data
            currency: null,
            brand: null,
            bagType: null,
            embedding: imgData.embedding,
            embeddingHash: imgData.embeddingHash,
            messageTimestamp: imgData.messageTimestamp,
            // Store validation confidence for later use
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

      // Update group stats
      try {
        await db.updateGroupProductCount(groupId);
        await db.updateStats();
      } catch (err) {
        console.error('Error updating stats:', err.message);
      }
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

