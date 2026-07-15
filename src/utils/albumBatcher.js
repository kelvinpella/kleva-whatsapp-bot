/**
 * Album Batcher Utility
 * Handles batching of media messages per group. A batch stays open for a group
 * until any non-media message arrives in that group. The batch is then closed
 * and queued for processing ONLY if the closing message provides a product
 * name; otherwise it is discarded. The price extracted from the closing
 * message is stored for the first image overlay.
 */

const albumBatches = new Map(); // Tracks open album batches per group

/**
 * Build batch data and invoke the completion callback for a batch.
 * @param {Object} batch
 * @param {string} product_name
 * @param {string|null} priceText
 * @returns {Promise<Object>} batchData
 */
async function flushBatch(batch, product_name, priceText = null) {
  const timestamp = batch.messages[0].timestamp;

  const batchData = {
    messageIds: batch.messages.map((m) => m.messageId),
    groupId: batch.groupId,
    groupName: batch.groupName,
    timestamp,
    author: batch.author,
    messageBody: batch.messages[0].messageBody || '',
    albumSize: batch.messages.length,
    product_name,
    priceText,
  };

  console.log(
    `\n🔒 Album batch closed for ${batch.groupName} - processing ${batch.messages.length} message(s)`
  );

  try {
    await batch.onBatchComplete(batchData);
    console.log(`✅ Album batch queued: ${batch.messages.length} message(s) from ${batch.groupName}`);
  } catch (err) {
    console.error(`❌ Error queueing album batch:`, err.message);
  }

  return batchData;
}

/**
 * Add a media message to the open batch for its group.
 *
 * @param {Object} messageData - Message data to batch
 * @param {string} messageData.messageId - WhatsApp message ID
 * @param {string} messageData.groupId - Group ID
 * @param {string} messageData.groupName - Group name
 * @param {string} messageData.author - Message author
 * @param {number} messageData.timestamp - Message timestamp
 * @param {string} messageData.messageBody - Message body
 * @param {Function} onBatchComplete - Callback when batch is ready to queue
 */
async function addMessageToBatch(messageData, onBatchComplete) {
  const { messageId, groupId, groupName, author, timestamp, messageBody } = messageData;
  const batchKey = groupId;

  if (!messageId) {
    console.error(`❌ Refusing to add message to batch without a messageId`);
    throw new Error('messageId is required to add a message to an album batch');
  }

  // Get or create album batch for this group
  let batch = albumBatches.get(batchKey);

  if (!batch) {
    batch = {
      groupId,
      groupName,
      author,
      messages: [],
      onBatchComplete,
    };
    albumBatches.set(batchKey, batch);
    console.log(`📦 Started new album batch for ${groupName}`);
  } else {
    console.log(`📦 Added to existing album batch (${batch.messages.length + 1} messages)`);
  }

  // Add message to batch
  batch.messages.push({
    messageId,
    timestamp,
    messageBody,
  });
}

/**
 * Close the open batch for a group.
 *
 * - If no product_name is provided, the batch is deleted and discarded.
 * - If a product_name is provided, the batch is added to the processing queue
 *   and then deleted.
 *
 * @param {string} groupId - Group ID whose batch should be closed
 * @param {string|null} product_name - Optional product name from the closing message
 * @param {string|null} priceText - Optional price text from the closing message
 * @returns {Promise<{closed: boolean, queued: boolean, timestamp?: number}>}
 */
async function closeBatchForGroup(groupId, product_name = null, priceText = null) {
  const batch = albumBatches.get(groupId);

  if (!batch) {
    return { closed: false, queued: false };
  }

  albumBatches.delete(groupId);

  if (!product_name) {
    console.log(
      `🗑️ Discarded album batch for ${batch.groupName} (${batch.messages.length} message(s)) - no product name found.`
    );
    return { closed: true, queued: false, timestamp: batch.messages[0].timestamp };
  }

  const batchData = await flushBatch(batch, product_name, priceText);

  return { closed: true, queued: true, timestamp: batchData.timestamp };
}

/**
 * Clear all active batches (useful for cleanup/shutdown)
 */
function clearAllBatches() {
  for (const [key, batch] of albumBatches.entries()) {
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
  closeBatchForGroup,
  clearAllBatches,
  getActiveBatchCount,
};
