#!/usr/bin/env node

/**
 * Test image validation and processing
 * Tests COCO-SSD handbag detection and image processor
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { processGroupImages, shouldProcessMessage } = require('./src/utils/imageProcessor');

async function testImageValidation() {
  console.log('🧪 Testing Image Validation Pipeline\n');

  // Create a test image (simple PNG white square)
  const testImagePath = path.join(__dirname, 'test-image.png');

  // Create a simple PNG (1x1 white pixel) for testing
  const pngHeader = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
    0x00, 0x00, 0x00, 0x0D, // IHDR chunk size
    0x49, 0x48, 0x44, 0x52, // IHDR
    0x00, 0x00, 0x00, 0x01, // width: 1
    0x00, 0x00, 0x00, 0x01, // height: 1
    0x08, 0x02, 0x00, 0x00, 0x00, // bit depth, color type, compression, filter, interlace
    0x90, 0x77, 0x53, 0xDE, // CRC
    0x00, 0x00, 0x00, 0x0C, // IDAT size
    0x49, 0x44, 0x41, 0x54, // IDAT
    0x08, 0x99, 0x01, 0x01, 0x00, 0x00, 0xFE, 0xFF,
    0x00, 0x00, 0x00, 0x02, 0x00, 0x01, 0x2D, 0xB4,
    0xB4, 0xEE, // data
    0x00, 0x00, 0x00, 0x00, // IEND size
    0x49, 0x45, 0x4E, 0x44, // IEND
    0xAE, 0x42, 0x60, 0x82  // CRC
  ]);

  fs.writeFileSync(testImagePath, pngHeader);
  console.log(`✓ Created test image: ${testImagePath}`);

  try {
    // Test 1: Process image through pipeline (metadata-only checks)
    console.log('\n📋 Test 1: Process image through pipeline');
    const imageBuffer = fs.readFileSync(testImagePath);
    const base64 = imageBuffer.toString('base64');

    const mockMessage = {
      from: 'group1@g.us',
      hasMedia: true,
      timestamp: Math.floor(Date.now() / 1000),
      groupMetadata: { id: 'group1@g.us', subject: 'Supplier Group' }
    };

    const mediaList = [{ data: base64 }];

    // Provide a mock DB with uploadBufferToStorage to avoid local saves
    const mockDb = {
      uploadBufferToStorage: async (bucket, destPath, buffer, contentType, makePublic) => {
        // Simulate successful upload without writing files
        return { path: destPath, url: `https://fake.storage/${destPath}` };
      }
    };

    const processed = await processGroupImages(mockMessage, mediaList, mockDb);
    console.log(`Processed images count: ${processed.length}`);
    if (processed.length > 0) {
      console.log('Sample metadata:', processed[0]);
    }

    // Test 2: Message filtering
    console.log('\n\n👥 Test 2: Message Filtering');
    const testMessages = [
      {
        name: 'Group with media',
        isGroup: true,
        hasMedia: true,
        groupMetadata: { id: 'group1@g.us', subject: 'Supplier Group' }
      },
      {
        name: 'Private with media',
        isGroup: false,
        hasMedia: true,
        groupMetadata: null
      },
      {
        name: 'Group without media',
        isGroup: true,
        hasMedia: false,
        groupMetadata: { id: 'group1@g.us', subject: 'Supplier Group' }
      }
    ];

    testMessages.forEach(msg => {
      const shouldProcess = shouldProcessMessage(msg);
      console.log(`${shouldProcess ? '✅' : '❌'} ${msg.name}: ${shouldProcess ? 'Process' : 'Skip'}`);
    });

    console.log('\n✅ All tests completed successfully!');
  } catch (err) {
    console.error('\n❌ Error during testing:', err.message);
  } finally {
    // Cleanup
    if (fs.existsSync(testImagePath)) {
      fs.unlinkSync(testImagePath);
      console.log(`\n🧹 Cleaned up test image`);
    }
  }
}

testImageValidation();
