/**
 * Search Handler
 * Handles image similarity search requests from private chats
 *
 * Requirements:
 * 1. Only search when message contains both /search command AND image
 * 2. Return supplier name, image, and date for first supplier's most recent match
 * 3. Reply "handbag unavailable from suppliers" if no matches
 */

const { calculateEmbedding } = require('../utils/imageProcessor');
const { MessageMedia } = require('whatsapp-web.js');
const config = require('../config');

/**
 * Perform image search for private messages
 * @param {Object} msg - WhatsApp message object
 * @param {Object} db - Supabase database handler
 * @param {Object} client - WhatsApp client
 */
async function performImageSearch(msg, db, client) {
  const startTime = Date.now();

  try {
    console.log('🔍 Starting image search...');

    // Step 1: Download the search image
    console.log('📥 Downloading search image...');
    const media = await msg.downloadMedia();

    if (!media || !media.data) {
      await msg.reply('❌ Imeshindikana kupakua picha. Tafadhali jaribu tena.');
      return;
    }

    // Convert base64 to buffer
    const imageBuffer = Buffer.from(media.data, 'base64');

    // Step 2: Generate embedding for search image
    console.log('🧮 Generating embedding...');
    const embedding = await calculateEmbedding(imageBuffer);

    if (!embedding || !embedding.pHash) {
      await msg.reply('❌ Imeshindikana kusindika picha. Tafadhali jaribu na picha nyingine.');
      return;
    }

    // Step 3: Query database for similar products
    console.log('🔎 Searching database...');
    const minSimilarity = config.minSimilarity || 0.7;
    const results = await db.searchSimilarProducts(embedding, minSimilarity, 50);

    if (!results || results.length === 0) {
      await msg.reply('mkoba haupatikani kutoka kwa wasambazaji');
      console.log('❌ No matches found');

      // Log search history
      await db.insertSearchRecord({
        embeddingHash: embedding.pHash,
        resultsCount: 0,
        durationMs: Date.now() - startTime
      });

      return;
    }

    // Step 4: Get the first supplier's most recent match
    // Results are already sorted by similarity, so take the first one
    const firstMatch = results[0];

    console.log(`✅ Found match: ${firstMatch.group_name} (similarity: ${(firstMatch.similarity * 100).toFixed(1)}%)`);

    // Step 5: Format and send response
    const response = formatSearchResult(firstMatch);
    await msg.reply(response);

    // Step 6: Send the matching image
    if (firstMatch.image_path) {
      try {
        // Download image from Supabase storage
        const imageUrl = await db.getPublicUrl('images', firstMatch.image_path);

        if (imageUrl) {
          const resultMedia = await MessageMedia.fromUrl(imageUrl);
          await client.sendMessage(msg.from, resultMedia, {
            caption: `📸 Mkoba kutoka ${firstMatch.group_name}`
          });
        }
      } catch (err) {
        console.error('Error sending result image:', err.message);
        // Continue even if image send fails - user already has text response
      }
    }

    // Log successful search
    await db.insertSearchRecord({
      embeddingHash: embedding.pHash,
      resultsCount: results.length,
      topMatchId: firstMatch.product_uuid,
      topMatchScore: firstMatch.similarity,
      durationMs: Date.now() - startTime
    });

    console.log(`✅ Search completed in ${Date.now() - startTime}ms`);

  } catch (err) {
    console.error('Error performing image search:', err.message);
    await msg.reply('❌ Hitilafu imetokea wakati wa kutafuta. Tafadhali jaribu tena.');
  }
}

/**
 * Format a single search result for WhatsApp message
 * @param {Object} result - Product result from database
 * @returns {string} Formatted message
 */
function formatSearchResult(result) {
  const supplierName = result.group_name || 'Unknown Supplier';
  const datePosted = result.message_timestamp
    ? new Date(result.message_timestamp * 1000).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      })
    : 'Unknown date';

  const similarity = result.similarity
    ? `${(result.similarity * 100).toFixed(1)}%`
    : 'N/A';

  return (
    `✅ *Mkoba Umepatikana*\n\n` +
    `👜 Msambazaji: ${supplierName}\n` +
    `📅 Tarehe: ${datePosted}\n` +
    `🎯 Ufanani: ${similarity}`
  );
}

module.exports = { performImageSearch, formatSearchResult };
