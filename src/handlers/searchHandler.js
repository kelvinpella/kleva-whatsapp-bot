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
 * @param {Set} resultsSent - Optional set of product UUIDs already sent (for deduplication in album search)
 * @param {number} imageNumber - Optional image number in album (for multi-image searches)
 */
async function performImageSearch(msg, db, client, resultsSent = null, imageNumber = null) {
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

    // Validate that it's an image (not video or other media)
    if (!media.mimetype || !media.mimetype.startsWith('image/')) {
      console.log(`⚠️ Search rejected: non-image media type (${media.mimetype})`);
      await msg.reply('❌ Tafadhali tuma picha tu, si video. Tuma picha ya mkoba na /search.');
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
      // Include image number if in album search
      const notFoundMsg = imageNumber
        ? `Picha ya ${imageNumber}: mkoba haupatikani kutoka kwa wasambazaji`
        : 'mkoba haupatikani kutoka kwa wasambazaji';

      await msg.reply(notFoundMsg);
      console.log(`❌ No matches found${imageNumber ? ` (image ${imageNumber})` : ''}`);

      // Log search history
      await db.insertSearchRecord({
        embeddingHash: embedding.pHash,
        resultsCount: 0,
        topMatchId: null,
        topMatchScore: null,
        durationMs: Date.now() - startTime
      });

      return;
    }

    // Step 4: Get the first supplier's most recent match
    // Results are already sorted by similarity, so take the first one
    const firstMatch = results[0];

    // Check for duplicate in album search
    if (resultsSent && resultsSent.has(firstMatch.product_uuid)) {
      console.log(`⏭️ Skipping duplicate result: ${firstMatch.group_name} (already sent in this album)`);
      // Still log the search but don't send duplicate response
      await db.insertSearchRecord({
        embeddingHash: embedding.pHash,
        resultsCount: results.length,
        topMatchId: null,
        topMatchScore: firstMatch.similarity,
        durationMs: Date.now() - startTime
      });
      return;
    }

    // Mark this product as sent (if deduplication is enabled)
    if (resultsSent) {
      resultsSent.add(firstMatch.product_uuid);
    }

    console.log(`✅ Found match: ${firstMatch.group_name} (similarity: ${(firstMatch.similarity * 100).toFixed(1)}%)`);

    // Step 5 & 6: Send image with formatted response as caption (combined in one message)
    if (firstMatch.image_path) {
      try {
        // Download image from Supabase storage as buffer
        console.log('📥 Downloading result image from storage...');
        const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'handbags';
        const imageUrl = db.getPublicUrl(bucket, firstMatch.image_path);

        if (imageUrl) {
          console.log('🖼️  Fetching image from:', imageUrl.substring(0, 80) + '...');

          // Download image as buffer instead of using fromUrl (which fails with Supabase)
          const response = await fetch(imageUrl);
          if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
          }

          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const base64 = buffer.toString('base64');

          // Format response text for caption (include image number if in album)
          const caption = formatSearchResult(firstMatch, imageNumber);

          // Create MessageMedia from buffer and send with full caption
          const resultMedia = new MessageMedia('image/jpeg', base64, 'result.jpg');
          await client.sendMessage(msg.from, resultMedia, { caption });
          console.log(`✅ Result sent: image + details in one message${imageNumber ? ` (image ${imageNumber})` : ''}`);
        } else {
          console.log('⚠️ No public URL available for image');
          // Fallback: send text only if image unavailable
          const response = formatSearchResult(firstMatch, imageNumber);
          await msg.reply(response);
        }
      } catch (err) {
        console.error('Error sending result image:', err.message);
        console.error('Full error:', err);
        // Fallback: send text only if image send fails
        const response = formatSearchResult(firstMatch, imageNumber);
        await msg.reply(response);
      }
    } else {
      // No image path - send text only
      const response = formatSearchResult(firstMatch, imageNumber);
      await msg.reply(response);
    }

    // Log successful search
    await db.insertSearchRecord({
      embeddingHash: embedding.pHash,
      resultsCount: results.length,
      topMatchId: null,  // Skip storing UUID (column is bigint, we use string UUIDs)
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
 * @param {number} imageNumber - Optional image number in album
 * @returns {string} Formatted message
 */
function formatSearchResult(result, imageNumber = null) {
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

  // Include image number prefix if in album search
  const prefix = imageNumber ? `Picha ya ${imageNumber}:\n` : '';

  return (
    prefix +
    `✅ *Mkoba Umepatikana*\n\n` +
    `👜 Msambazaji: ${supplierName}\n` +
    `📅 Tarehe: ${datePosted}\n` +
    `🎯 Ufanani: ${similarity}`
  );
}

module.exports = { performImageSearch, formatSearchResult };
