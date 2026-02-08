require('dotenv').config();

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  phoneNumber: process.env.YOUR_PHONE_NUMBER || null,
  supplierGroupIds: (process.env.SUPPLIER_GROUP_IDS || '').split(',').filter(Boolean),
  cleanupDays: parseInt(process.env.CLEANUP_DAYS || '30', 10),
  minSimilarity: parseFloat(process.env.MIN_SIMILARITY || '0.7')
};
