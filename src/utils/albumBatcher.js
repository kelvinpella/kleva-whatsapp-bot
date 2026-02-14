/**
 * Album Batcher Utility
 * Handles batching of media messages within a time window to detect albums
 */

const ALBUM_WINDOW_MS = 2000; // 2-second window for album detection
const albumBatches = new Map(); // Tracks album batches per group/author

/**
 * Add a message to album batch and queue when window closes
 *
 * @param {Object} messageData - Message data to batch
 * @param {string} messageData.messageId - WhatsApp message ID
 * @param {string} messageData.groupId - Group ID
 * @param {string} messageData.groupName - Group name
 * @param {string} messageData.author - Message author
 * @param {number} messageData.timestamp - Message timestamp
 * @param {string} messageData.messageBody - Message body/caption
 * @param {Function} onBatchComplete - Callback when batch is ready to queue
 */
function addMessageToBatch(messageData, onBatchComplete) {
  const { messageId, groupId, groupName, author, timestamp, messageBody } = messageData;
  const batchKey = `${groupId}_${author}`;

  // Get or create album batch for this group/author
  let batch = albumBatches.get(batchKey);

  if (!batch) {
    // Create new batch
    batch = {
      groupId,
      groupName,
      author,
      messages: [],
      timeout: null
    };
    albumBatches.set(batchKey, batch);
    console.log(`📦 Started new album batch for ${groupName}`);
  } else {
    // Clear existing timeout (extend window)
    clearTimeout(batch.timeout);
    console.log(`📦 Added to existing album batch (${batch.messages.length + 1} messages)`);
  }

  // Add message to batch
  batch.messages.push({
    messageId,
    timestamp,
    messageBody,
  });

  // Set timeout to process batch after 2 seconds of inactivity
  batch.timeout = setTimeout(async () => {
    console.log(`\n⏰ Album window closed for ${groupName} - processing ${batch.messages.length} message(s)`);

    // Remove batch from map
    albumBatches.delete(batchKey);

    // Create batch data for queue
    const batchData = {
      messageIds: batch.messages.map(m => m.messageId),
      groupId: batch.groupId,
      groupName: batch.groupName,
      timestamp: batch.messages[0].timestamp,
      author: batch.author,
      messageBody: batch.messages[0].messageBody || '',
      albumSize: batch.messages.length,
    };

    // Call completion callback
    try {
      await onBatchComplete(batchData);
      console.log(`✅ Album batch queued: ${batch.messages.length} message(s) from ${groupName}`);
    } catch (err) {
      console.error(`❌ Error queueing album batch:`, err.message);
    }
  }, ALBUM_WINDOW_MS);
}

/**
 * Clear all active batches (useful for cleanup/shutdown)
 */
function clearAllBatches() {
  for (const [key, batch] of albumBatches.entries()) {
    clearTimeout(batch.timeout);
    albumBatches.delete(key);
  }
  console.log('🧹 Cleared all album batches');
}

/**
 * Get current batch count (useful for debugging)
 */
function getActiveBatchCount() {
  return albumBatches.size;
}

module.exports = {
  addMessageToBatch,
  clearAllBatches,
  getActiveBatchCount,
  ALBUM_WINDOW_MS
};
