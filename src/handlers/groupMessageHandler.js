/**
 * Group Message Handler
 * Handles incoming WhatsApp group messages for media processing
 *
 * Features:
 * - Filters messages from allowed groups only
 * - Detects albums (multiple media messages within 2-second window)
 * - Queues album jobs for processing via BullMQ
 */

const { Queue } = require('bullmq');
const Redis = require('ioredis');
const { addMessageToBatch } = require('../utils/albumBatcher');
const { shouldProcessMessage } = require('../utils/messageFilter');

// Initialize Redis connection
// Uses REDIS_URL env var if available (Railway), otherwise defaults to localhost
const redisConnection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

// Initialize BullMQ Queue for album processing jobs
const albumProcessingQueue = new Queue('albumProcessing', {
  connection: redisConnection, removeOnComplete:true,
  removeOnFail: {
    age: 2 * 24 * 3600 // keep failed jobs for 2 days
  }
});

/**
 * Handle incoming group messages
 * - Filters messages from allowed groups only
 * - Checks for media content
 * - Detects albums (multiple media messages within 2-second window)
 * - Adds media messages to BullMQ queue for processing
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

    // Check if message contains media
    if (!msg.hasMedia) {
      console.log(`⏭️ Message has no media, ignoring...`);
      return;
    }

    // Message has media - add to album batch
    console.log(`📸 Message contains media, adding to album batch...`);

    // Add message to batch with callback to queue when batch is complete
    addMessageToBatch(
      {
        messageId: msg.id._serialized,
        groupId,
        groupName,
        author: msg.author || msg.from,
        timestamp: msg.timestamp,
        messageBody: msg.body || '',
      },
      async (batchData) => {
        // Create album processing job
        // Parent worker will process media and create child jobs for each TikTok post
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
