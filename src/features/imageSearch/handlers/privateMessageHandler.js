/**
 * Private Message Handler
 * Handles incoming WhatsApp private messages for image search
 *
 * Features:
 * - Commands: /help, /stats, /search
 * - Image search functionality
 * - Images from private chats are NOT saved to database (search only)
 */

/**
 * Handle incoming private messages
 * - Used for image search queries
 * - Commands: /help, /stats, search by image
 * - Requirement: Images from private chats are NOT saved to database
 *
 * @param {Object} msg - WhatsApp message
 * @param {Object} db - Supabase database handler
 * @param {Object} client - WhatsApp client
 */
async function handlePrivateMessage(msg, db, client) {
  // TODO: Implement search functionality in private chats
  console.log('Received private message - search functionality not implemented yet');
}

module.exports = { handlePrivateMessage };
