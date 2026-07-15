/**
 * Group Message Handler
 * Handles incoming WhatsApp group messages for media processing
 *
 * Features:
 * - Filters messages from allowed groups only
 * - Batches media messages per group until a non-media message closes the batch
 * - Only queues album jobs when the closing message provides a product name
 */

const { addMessageToBatch, closeBatchForGroup } = require('../utils/albumBatcher');
const { shouldProcessMessage } = require('../utils/messageFilter');
const { parseProductMessage } = require('../utils/productNameParser');
const { albumProcessingQueue } = require('../utils/queues');

/**
 * Extract a stable serialized message id from a WhatsApp Web.js message.
 * In some message types the `_serialized` field is missing, so we fall back
 * to assembling it from the raw MsgKey parts.
 * @param {Object} msg
 * @returns {string|null}
 */
function extractMessageId(msg) {
  if (!msg || !msg.id) {
    return null;
  }

  if (msg.id._serialized) {
    return msg.id._serialized;
  }

  if (typeof msg.id === 'string') {
    return msg.id;
  }

  const remote = msg.id.remote?._serialized || msg.id.remote;
  const id = msg.id.id;
  if (remote && id) {
    return `${remote}_${msg.id.fromMe ? 'true' : 'false'}_${id}`;
  }

  return null;
}

/**
 * Handle incoming group messages
 * - Filters messages from allowed groups only
 * - Checks for media content
 * - Batches media messages per group until closed by a non-media message
 * - Only queues album jobs when the closing message provides a product name
 *
 * @param {Object} msg - WhatsApp message
 * @param {Object} db - Supabase database handler
 * @param {Object} client - WhatsApp client
 */
async function handleGroupMessage(msg, db, client) {
  const groupId = msg.from;

  // Environment-based filtering: dev only processes /bottest, production ignores /bottest
  // if (!shouldProcessMessage(msg)) {
  //   return;
  // }

  try {
    // Get allowed groups from environment variable
    // Format supports: "GroupName:GroupID" or just "GroupID"
    const allowedGroupsString = process.env.ALLOWED_GROUPS || '';
    const allowedGroups = allowedGroupsString
      .split(',')
      .map(entry => {
        const trimmed = entry.trim();
        // If format is "Name:ID", extract just the ID part
        return trimmed.includes(':') ? trimmed.split(':')[1].trim() : trimmed;
      })
      .filter(id => id.length > 0);

    // Check if this group is in the allowed list
    if (!allowedGroups.includes(groupId)) {
      console.log(`⏭️ Ignoring message from non-allowed group: ${groupId}`);
      return;
    }

    // Get group name for logging
    const chat = await msg.getChat();
    const groupName = chat.name || msg.groupMetadata?.subject || 'Unknown Group';

    console.log(`\n📨 Received message from allowed group: ${groupName} (${groupId})`);

    // Any text-only message closes the open album batch for this group.
    // The batch is queued only if the message provides a product name;
    // otherwise it is discarded. The price is extracted for the image overlay.
    if (!msg.hasMedia) {
      const parsed = parseProductMessage(msg.body || '');
      const product_name = parsed?.product_name || null;
      const priceText = parsed?.priceText || null;

      if (product_name) {
        console.log(`📝 Product name parsed: ${product_name}`);
      }
      if (priceText) {
        console.log(`💰 Price parsed: ${priceText}`);
      }

      const closeResult = await closeBatchForGroup(groupId, product_name, priceText);

      if (!closeResult.closed) {
        console.log(`⏭️ Message has no media and no open album batch exists, ignoring...`);
        return;
      }

      if (closeResult.queued) {
        console.log(`✅ Album batch with product name queued for processing.`);
      } else {
        console.log(`🗑️ Album batch closed and discarded - no product name found.`);
      }
      return;
    }

    // Message has media - add to album batch
    console.log(`📸 Message contains media, adding to album batch...`);

    const messageId = extractMessageId(msg);
    if (!messageId) {
      console.error(`❌ Could not extract message id from media message; ignoring.`);
      return;
    }

    // Add message to batch with callback to queue when batch is complete
    await addMessageToBatch(
      {
        messageId,
        groupId,
        groupName,
        author: msg.author || msg.from,
        timestamp: msg.timestamp,
        messageBody: msg.body || '',
      },
      async (batchData) => {
        // Create album processing job
        // Parent worker will process media and create the social post job
        const jobName = `processAlbum-${batchData.groupId}-${Date.now()}`;

        await albumProcessingQueue.add(jobName, batchData, {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        });

        console.log(`✅ Created album processing job: ${jobName}`);
      }
    );

  } catch (err) {
    console.error('Error handling group message:', err.message);
  }
}

module.exports = { handleGroupMessage };
