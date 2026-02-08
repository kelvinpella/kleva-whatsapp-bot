/**
 * Scheduled Tasks
 * Cleanup, backups, and maintenance tasks
 */

const cron = require('node-cron');
const config = require('../config');

/**
 * Schedule cleanup tasks
 */
function scheduleCleanup(db) {
  console.log('📅 Scheduling cleanup tasks...');

  // Daily cleanup at 3 AM (delete old images)
  cron.schedule('0 3 * * *', () => {
    console.log('🧹 Running daily cleanup...');
    const deleted = db.deleteOldProducts(config.cleanupDays);
    console.log(`✓ Deleted ${deleted.changes} old image records`);
  });

  // Weekly optimization at 2 AM Sunday
  cron.schedule('0 2 * * 0', () => {
    console.log('⚙️  Running weekly optimization...');
    db.optimizeIndexes();
    db.vacuum();
  });

  // Daily backup at 1 AM
  cron.schedule('0 1 * * *', () => {
    console.log('💾 Running daily backup...');
    try {
      db.backup(config.backupPath || './backups');
    } catch (err) {
      console.error('Backup failed:', err);
    }
  });

  // Hourly stats update
  cron.schedule('0 * * * *', () => {
    try {
      db.updateStats();
      console.log('📊 Stats updated');
    } catch (err) {
      console.error('Stats update failed:', err);
    }
  });

  console.log('✓ Cleanup tasks scheduled');
}

module.exports = { scheduleCleanup };
