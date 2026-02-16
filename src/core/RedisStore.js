/**
 * Redis Store for WhatsApp RemoteAuth
 * Implements the store interface required by whatsapp-web.js RemoteAuth
 */

const fs = require('fs-extra');
const Redis = require('ioredis');

class RedisStore {
  constructor(options = {}) {
    this.redisClient = options.redisClient || new Redis(
      process.env.REDIS_URL || 'redis://localhost:6379',
      {
        maxRetriesPerRequest: null,
        enableReadyCheck: true,
        lazyConnect: false
      }
    );

    console.log('📦 RedisStore initialized for WhatsApp session persistence');
  }

  /**
   * Check if session exists in Redis
   * @param {Object} options - Options object
   * @param {string} options.session - Session name
   * @returns {Promise<boolean>}
   */
  async sessionExists({ session }) {
    try {
      const key = `whatsapp_session:${session}`;
      const exists = await this.redisClient.exists(key);
      return exists === 1;
    } catch (err) {
      console.error('❌ Error checking session existence:', err.message);
      return false;
    }
  }

  /**
   * Save compressed session file to Redis
   * @param {Object} options - Options object
   * @param {string} options.session - Path to the compressed session zip file
   * @returns {Promise<void>}
   */
  async save({ session }) {
    try {
      const zipPath = `${session}.zip`;
      const sessionName = session.split('/').pop();
      const key = `whatsapp_session:${sessionName}`;

      // Read the compressed session file as buffer
      const buffer = await fs.readFile(zipPath);

      // Store in Redis as binary data
      await this.redisClient.setBuffer(key, buffer);

      console.log(`💾 Session saved to Redis: ${sessionName}`);
    } catch (err) {
      console.error('❌ Error saving session to Redis:', err.message);
      throw err;
    }
  }

  /**
   * Extract session from Redis and write to filesystem
   * @param {Object} options - Options object
   * @param {string} options.session - Session name
   * @param {string} options.path - Path where to extract the compressed file
   * @returns {Promise<void>}
   */
  async extract({ session, path }) {
    try {
      const sessionName = session.split('/').pop();
      const key = `whatsapp_session:${sessionName}`;

      // Retrieve the buffer from Redis
      const buffer = await this.redisClient.getBuffer(key);

      if (!buffer) {
        throw new Error(`Session not found in Redis: ${sessionName}`);
      }

      // Write the buffer to the filesystem
      await fs.writeFile(path, buffer);

      console.log(`♻️  Session extracted from Redis: ${sessionName}`);
    } catch (err) {
      console.error('❌ Error extracting session from Redis:', err.message);
      throw err;
    }
  }

  /**
   * Delete session from Redis
   * @param {Object} options - Options object
   * @param {string} options.session - Session name
   * @returns {Promise<void>}
   */
  async delete({ session }) {
    try {
      const sessionName = session.split('/').pop();
      const key = `whatsapp_session:${sessionName}`;

      await this.redisClient.del(key);

      console.log(`🗑️  Session deleted from Redis: ${sessionName}`);
    } catch (err) {
      console.error('❌ Error deleting session from Redis:', err.message);
      throw err;
    }
  }
}

module.exports = RedisStore;
