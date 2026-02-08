#!/usr/bin/env node
require('dotenv').config();
const { loadCocoModel } = require('./src/utils/imageValidator');

async function test() {
  console.log('Loading COCO-SSD model...');
  try {
    const model = await loadCocoModel();
    console.log('Model loaded:', !!model);
    process.exit(0);
  } catch (err) {
    console.error('Model load failed:', err.message);
    process.exit(1);
  }
}

test();