/**
 * Message Filter Utility
 * Handles environment-based message filtering for development vs production
 */

/**
 * Check if a message should be processed based on environment
 *
 * Development mode: Only process messages containing '/bottest'
 * Production mode: Process all messages EXCEPT those containing '/bottest'
 *
 * @param {Object} msg - WhatsApp message object
 * @returns {boolean} True if message should be processed, false otherwise
 */
function shouldProcessMessage(msg) {
  const nodeEnv = process.env.NODE_ENV || 'production';
  const messageBody = (msg.body || '').toLowerCase();
  const isBotTest = messageBody.includes('/bottest');

  if (nodeEnv === 'development') {
    // Development: Only process messages with /bottest
    if (!isBotTest) {
      console.log(`⏭️ [DEV MODE] Ignoring message without /bottest marker`);
      return false;
    }
    console.log(`🧪 [DEV MODE] Processing test message with /bottest`);
    return true;
  } else {
    // Production: Ignore messages with /bottest
    if (isBotTest) {
      console.log(`⏭️ [PRODUCTION] Ignoring test message with /bottest`);
      return false;
    }
    return true;
  }
}

module.exports = {
  shouldProcessMessage
};
