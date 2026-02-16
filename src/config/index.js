require('dotenv').config();

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  phoneNumber: process.env.YOUR_PHONE_NUMBER || null,
  supplierGroupIds: (() => {
    const allowedGroupsString = process.env.ALLOWED_GROUPS || '';
    const groupIds = allowedGroupsString
      .split(',')
      .map(entry => {
        const trimmed = entry.trim();
        // If format is "Name:ID", extract just the ID part
        return trimmed.includes(':') ? trimmed.split(':')[1].trim() : trimmed;
      })
      .filter(id => id.length > 0);
    // Filter out .env.example placeholders (group1@g.us, group2@g.us)
    return groupIds.filter(id => !/^group\d+@g\.us$/i.test(id));
  })(),
  cleanupDays: parseInt(process.env.CLEANUP_DAYS || '30', 10)
};
