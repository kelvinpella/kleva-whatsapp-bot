/**
 * Remote Authentication Store for WhatsApp Web.js
 * Stores session data in Redis for persistence across container rebuilds
 * Used in production environments (Railway) where filesystem is ephemeral
 */

const Redis = require('ioredis');

class RemoteAuth {
  constructor(options = {}) {
    this.clientId = options.clientId || 'default';
    this.redisClient = options.redisClient || new Redis(
      process.env.REDIS_URL,
      {
        maxRetriesPerRequest: null,
        enableReadyCheck: true,
        lazyConnect: false
      }
    );
    this.dataPath = '';
    this.sessionKey = `whatsapp_session:${this.clientId}`;

    console.log(`🔐 RemoteAuth initialized (Redis-based storage)`);
    console.log(`📍 Client ID: ${this.clientId}`);
  }

  async beforeBrowserInitialized() {
    // Check if session exists in Redis
    try {
      const sessionData = await this.redisClient.get(this.sessionKey);
      if (sessionData) {
        console.log('✅ Found existing session in Redis - will attempt to restore');
      } else {
        console.log('ℹ️  No existing session in Redis - new authentication required');
      }
    } catch (err) {
      console.error('❌ Error checking Redis session:', err.message);
    }

    return {
      WABrowserId: this.clientId,
      WASecretBundle: '',
      WAToken1: '',
      WAToken2: ''
    };
  }

  async disconnect() {
    console.log('🔌 RemoteAuth disconnected');
  }

  async destroy() {
    try {
      await this.redisClient.del(this.sessionKey);
      console.log('🗑️  Session data removed from Redis');
    } catch (err) {
      console.error('❌ Error removing session from Redis:', err.message);
    }
  }

  async logout() {
    await this.destroy();
  }

  /**
   * Save session data to Redis
   */
  async store(sessionData) {
    try {
      const serialized = JSON.stringify(sessionData);
      await this.redisClient.set(this.sessionKey, serialized);
      console.log('💾 Session data saved to Redis');
    } catch (err) {
      console.error('❌ Error saving session to Redis:', err.message);
      throw err;
    }
  }

  /**
   * Extract session data from browser and save to Redis
   */
  async extract(page) {
    try {
      // Extract localStorage data from the page
      const data = await page.evaluate(() => {
        return JSON.parse(JSON.stringify(localStorage));
      });

      // Save to Redis
      await this.store(data);

      return data;
    } catch (err) {
      console.error('❌ Error extracting session data:', err.message);
      throw err;
    }
  }

  /**
   * Restore session data from Redis to browser
   */
  async restore(page) {
    try {
      // Get session data from Redis
      const sessionData = await this.redisClient.get(this.sessionKey);

      if (!sessionData) {
        console.log('ℹ️  No session data to restore');
        return false;
      }

      const data = JSON.parse(sessionData);

      // Inject session data into page's localStorage
      await page.evaluateOnNewDocument((data) => {
        for (const [key, value] of Object.entries(data)) {
          localStorage.setItem(key, value);
        }
      }, data);

      console.log('♻️  Session data restored from Redis');
      return true;
    } catch (err) {
      console.error('❌ Error restoring session from Redis:', err.message);
      return false;
    }
  }
}

module.exports = RemoteAuth;
