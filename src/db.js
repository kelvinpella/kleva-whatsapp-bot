const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.sqlite');

// Ensure data directory exists
if (!fs.existsSync(path.dirname(DB_PATH))) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

class DatabaseHandler {
  constructor() {
    this.db = new Database(DB_PATH);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initSchema();
  }

  initSchema() {
    // Products/Images table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_uuid TEXT UNIQUE NOT NULL,
        group_id TEXT NOT NULL,
        group_name TEXT NOT NULL,
        image_path TEXT NOT NULL,
        thumbnail_path TEXT,
        caption TEXT,
        price REAL,
        currency TEXT DEFAULT 'TZS',
        brand TEXT,
        bag_type TEXT,
        embedding BLOB,
        embedding_hash TEXT,
        message_timestamp INTEGER,
        indexed_at INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Supplier groups table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS supplier_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id TEXT UNIQUE NOT NULL,
        group_name TEXT NOT NULL,
        group_icon BLOB,
        is_active BOOLEAN DEFAULT 1,
        last_checked INTEGER,
        product_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Search history table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS search_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        search_image_path TEXT,
        search_embedding_hash TEXT,
        results_count INTEGER,
        top_match_id INTEGER,
        top_match_score REAL,
        search_duration_ms INTEGER,
        user_number TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (top_match_id) REFERENCES products(id)
      );
    `);

    // Statistics table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        total_products INTEGER DEFAULT 0,
        total_groups INTEGER DEFAULT 0,
        total_searches INTEGER DEFAULT 0,
        total_images_processed INTEGER DEFAULT 0,
        total_images_failed INTEGER DEFAULT 0,
        last_updated INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes for faster queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_products_group_id ON products(group_id);
      CREATE INDEX IF NOT EXISTS idx_products_embedding_hash ON products(embedding_hash);
      CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand);
      CREATE INDEX IF NOT EXISTS idx_products_indexed_at ON products(indexed_at);
      CREATE INDEX IF NOT EXISTS idx_supplier_groups_active ON supplier_groups(is_active);
      CREATE INDEX IF NOT EXISTS idx_search_history_created ON search_history(created_at);
    `);

    console.log('✓ Database schema initialized');
  }

  // Product operations
  insertProduct(data) {
    const stmt = this.db.prepare(`
      INSERT INTO products (
        product_uuid, group_id, group_name, image_path, thumbnail_path,
        caption, price, currency, brand, bag_type, embedding, embedding_hash,
        message_timestamp, indexed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    return stmt.run(
      data.uuid,
      data.groupId,
      data.groupName,
      data.imagePath,
      data.thumbnailPath || null,
      data.caption || null,
      data.price || null,
      data.currency || 'TZS',
      data.brand || null,
      data.bagType || null,
      data.embedding || null,
      data.embeddingHash || null,
      data.messageTimestamp || Math.floor(Date.now() / 1000),
      Math.floor(Date.now() / 1000)
    );
  }

  getProductById(id) {
    const stmt = this.db.prepare('SELECT * FROM products WHERE id = ?');
    return stmt.get(id);
  }

  getProductsByGroupId(groupId, limit = 50) {
    const stmt = this.db.prepare(`
      SELECT * FROM products WHERE group_id = ? ORDER BY indexed_at DESC LIMIT ?
    `);
    return stmt.all(groupId, limit);
  }

  searchSimilarProducts(embeddingHash, minSimilarity = 0.7, limit = 5) {
    // Simple hash-based similarity search (placeholder for full embedding search)
    const stmt = this.db.prepare(`
      SELECT * FROM products WHERE embedding_hash = ? LIMIT ?
    `);
    return stmt.all(embeddingHash, limit);
  }

  updateProduct(id, data) {
    const updates = [];
    const values = [];

    if (data.embedding) {
      updates.push('embedding = ?');
      values.push(data.embedding);
    }
    if (data.embeddingHash) {
      updates.push('embedding_hash = ?');
      values.push(data.embeddingHash);
    }
    if (data.thumbnail_path) {
      updates.push('thumbnail_path = ?');
      values.push(data.thumbnail_path);
    }
    if (data.price !== undefined) {
      updates.push('price = ?');
      values.push(data.price);
    }
    if (data.brand) {
      updates.push('brand = ?');
      values.push(data.brand);
    }
    if (data.bagType) {
      updates.push('bag_type = ?');
      values.push(data.bagType);
    }

    if (updates.length === 0) return null;

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const stmt = this.db.prepare(`
      UPDATE products SET ${updates.join(', ')} WHERE id = ?
    `);

    return stmt.run(...values);
  }

  deleteProductById(id) {
    const stmt = this.db.prepare('DELETE FROM products WHERE id = ?');
    return stmt.run(id);
  }

  // Group operations
  insertSupplierGroup(groupId, groupName) {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO supplier_groups (group_id, group_name, last_checked)
      VALUES (?, ?, ?)
    `);
    return stmt.run(groupId, groupName, Math.floor(Date.now() / 1000));
  }

  getSupplierGroups(activeOnly = true) {
    const query = activeOnly
      ? 'SELECT * FROM supplier_groups WHERE is_active = 1'
      : 'SELECT * FROM supplier_groups';
    return this.db.prepare(query).all();
  }

  updateGroupProductCount(groupId) {
    const count = this.db.prepare(
      'SELECT COUNT(*) as cnt FROM products WHERE group_id = ?'
    ).get(groupId);

    const stmt = this.db.prepare(`
      UPDATE supplier_groups
      SET product_count = ?, updated_at = CURRENT_TIMESTAMP
      WHERE group_id = ?
    `);
    return stmt.run(count.cnt, groupId);
  }

  // Search history operations
  insertSearchRecord(data) {
    const stmt = this.db.prepare(`
      INSERT INTO search_history (
        search_image_path, search_embedding_hash, results_count,
        top_match_id, top_match_score, search_duration_ms, user_number
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    return stmt.run(
      data.imagePath || null,
      data.embeddingHash || null,
      data.resultsCount || 0,
      data.topMatchId || null,
      data.topMatchScore || null,
      data.durationMs || 0,
      data.userNumber || null
    );
  }

  getSearchHistory(limit = 100) {
    const stmt = this.db.prepare(`
      SELECT * FROM search_history ORDER BY created_at DESC LIMIT ?
    `);
    return stmt.all(limit);
  }

  // Statistics operations
  getStats() {
    return this.db.prepare('SELECT * FROM stats ORDER BY created_at DESC LIMIT 1').get();
  }

  updateStats() {
    const totalProducts = this.db.prepare('SELECT COUNT(*) as cnt FROM products').get().cnt;
    const totalGroups = this.db.prepare('SELECT COUNT(*) as cnt FROM supplier_groups').get().cnt;
    const totalSearches = this.db.prepare('SELECT COUNT(*) as cnt FROM search_history').get().cnt;

    const existing = this.getStats();

    if (existing) {
      const stmt = this.db.prepare(`
        UPDATE stats SET
          total_products = ?,
          total_groups = ?,
          total_searches = ?,
          last_updated = ?
        WHERE id = ?
      `);
      stmt.run(totalProducts, totalGroups, totalSearches, Math.floor(Date.now() / 1000), existing.id);
    } else {
      const stmt = this.db.prepare(`
        INSERT INTO stats (total_products, total_groups, total_searches, last_updated)
        VALUES (?, ?, ?, ?)
      `);
      stmt.run(totalProducts, totalGroups, totalSearches, Math.floor(Date.now() / 1000));
    }
  }

  // Cleanup operations
  deleteOldProducts(daysOld = 30) {
    const cutoffTime = Math.floor((Date.now() - daysOld * 24 * 60 * 60 * 1000) / 1000);
    const stmt = this.db.prepare('DELETE FROM products WHERE indexed_at < ?');
    return stmt.run(cutoffTime);
  }

  deleteOldSearchHistory(daysOld = 90) {
    const stmt = this.db.prepare(`
      DELETE FROM search_history WHERE created_at < datetime('now', '-${daysOld} days')
    `);
    return stmt.run();
  }

  // Maintenance
  vacuum() {
    this.db.exec('VACUUM;');
    console.log('✓ Database vacuumed');
  }

  optimizeIndexes() {
    this.db.exec('ANALYZE;');
    console.log('✓ Database indexes optimized');
  }

  backup(backupPath) {
    if (!fs.existsSync(backupPath)) {
      fs.mkdirSync(backupPath, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupPath, `db-backup-${timestamp}.sqlite`);
    this.db.backup(backupFile);
    console.log(`✓ Database backed up to ${backupFile}`);
    return backupFile;
  }

  close() {
    this.db.close();
    console.log('✓ Database connection closed');
  }
}

module.exports = DatabaseHandler;
