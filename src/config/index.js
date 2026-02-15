require('dotenv').config();

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  phoneNumber: process.env.YOUR_PHONE_NUMBER || null,
  supplierGroupIds: (() => {
    const raw = (process.env.SUPPLIER_GROUP_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
    // Filter out .env.example placeholders (group1@g.us, group2@g.us) - real IDs are numeric
    return raw.filter(id => !/^group\d+@g\.us$/i.test(id));
  })(),
  cleanupDays: parseInt(process.env.CLEANUP_DAYS || '30', 10),
  minSimilarity: parseFloat(process.env.MIN_SIMILARITY || '0.7'),

  // Multi-feature matching weights (for fine-tuning discrimination)
  featureWeights: {
    semantic: parseFloat(process.env.SEMANTIC_WEIGHT || '0.60'),
    texture: parseFloat(process.env.TEXTURE_WEIGHT || '0.25'),
    color: parseFloat(process.env.COLOR_WEIGHT || '0.15')
  }
};
