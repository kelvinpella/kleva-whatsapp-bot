#!/usr/bin/env node

/**
 * Quick test to verify Supabase connection
 */

require('dotenv').config();
const SupabaseHandler = require('./src/supabaseDb');

async function testSupabaseConnection() {
  console.log('🧪 Testing Supabase connection...\n');

  try {
    const db = new SupabaseHandler();
    console.log('✓ Supabase handler initialized\n');

    // Test fetching stats
    console.log('📊 Fetching current stats...');
    const stats = await db.getStats();
    console.log('Stats:', stats || 'No stats yet (database empty)\n');

    // Test fetching supplier groups
    console.log('👥 Fetching supplier groups...');
    const groups = await db.getSupplierGroups();
    console.log(`Found ${groups.length} supplier group(s)\n`);

    // Test updating stats
    console.log('📈 Updating stats...');
    const updatedStats = await db.updateStats();
    console.log('✓ Stats updated:\n', updatedStats, '\n');

    console.log('✅ Supabase connection verified successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Connection failed:', err.message);
    process.exit(1);
  }
}

testSupabaseConnection();
