# 🚀 TikTok Auto-Poster Implementation Plan

**Project**: WhatsApp to TikTok Album Auto-Upload Integration
**Timeline**: 4-6 weeks (including TikTok API approval wait time)
**Approach**: Integration into existing WhatsApp bot
**Technology**: Node.js, Bull Queue, Redis, TikTok Content Posting API

---

## 📋 REQUIREMENTS SUMMARY

### Core Functionality
- ✅ Detect media (images/videos) from supplier group messages
- ✅ Group all media from **single WhatsApp message** into one album
- ✅ Upload albums to TikTok sequentially (one at a time)
- ✅ 1-minute delay between album uploads
- ✅ Random caption selection from predefined list
- ✅ OAuth token refresh mechanism
- ✅ Media format validation (no manipulation)
- ✅ Error handling with retry logic

### Out of Scope (Future Improvements)
- ❌ No deduplication between messages
- ❌ No content filtering (post everything)
- ❌ No caption extraction from WhatsApp
- ❌ No analytics or performance tracking
- ❌ No post scheduling optimization
- ❌ No manual review queue
- ❌ No automated tests
- ❌ No multiple TikTok accounts

### Implementation Notes
- Existing image search feature will be **commented out** during implementation
- Focus on core TikTok upload functionality only
- Leverage existing WhatsApp infrastructure
- No media manipulation (resize, compress, etc.) - validate and skip if invalid

---

## 🗓️ WEEK 0: PRE-DEVELOPMENT (BLOCKING - STARTS IMMEDIATELY)

### **Action Items (Complete ASAP)**

#### 1. TikTok API Access Application (1-2 hours)
**CRITICAL**: This has 2-4 week approval time - start NOW

- [ ] Create TikTok for Developers account
- [ ] Register new app at https://developers.tiktok.com/
- [ ] Fill out application form:
  - App name: "Kleva Product Showcase"
  - Description: "Automated product catalog posting from supplier feeds"
  - Use case: "E-commerce content automation"
  - Products needed: "Content Posting API"
- [ ] Submit for review
- [ ] Wait for approval email (track status daily)

#### 2. TikTok Business Account Setup (30 minutes)
- [ ] Create/convert TikTok account to Business Account
- [ ] Set up profile:
  - Username: @kleva_handbags (or similar)
  - Bio: "Latest handbag collections 👜 | Tanzania 🇹🇿"
  - Profile picture
  - Link to website/WhatsApp Business
- [ ] Document account credentials in `.env`

#### 3. API Research & Documentation (2-3 hours)
- [ ] Read TikTok Content Posting API documentation thoroughly
- [ ] Verify photo carousel/album support:
  - Check if API supports multi-image posts
  - Understand image vs video album limitations
  - Document maximum images per album
- [ ] Document rate limits:
  - Posts per minute
  - Posts per hour
  - Posts per day
  - Account-level restrictions
- [ ] Understand media requirements:
  - Image formats (JPEG, PNG, etc.)
  - Video formats (MP4, MOV, etc.)
  - File size limits
  - Aspect ratio requirements
  - Duration limits (videos)
- [ ] Test OAuth 2.0 flow in sandbox (if available)
- [ ] Create `docs/TIKTOK_API_NOTES.md` with findings

#### 4. Test Account Setup (30 minutes)
- [ ] Create separate test TikTok business account
- [ ] Use for development/testing to avoid spamming main account
- [ ] Document test account credentials

#### 5. Redis/Upstash Setup (1 hour)
- [ ] Sign up for Upstash Redis (free tier)
- [ ] Create new Redis database
- [ ] Get connection URL
- [ ] Add to `.env`: `UPSTASH_REDIS_URL=redis://...`
- [ ] Test connection locally

#### 6. Caption Bank Creation (30 minutes)
- [ ] Create `data/captions.json` with 20-30 caption templates
- [ ] Include variations for:
  - Handbags/purses
  - Leather goods
  - Fashion accessories
- [ ] Add relevant hashtags: #handbags #fashion #tanzania #leather #accessories
- [ ] Example format:
  ```json
  [
    "Gorgeous leather handbag 👜✨ #handbags #fashion #tanzania",
    "Premium quality bags available now! 💼 #leather #accessories",
    "New arrivals just dropped! 🔥 #handbags #fashion"
  ]
  ```

**✅ WEEK 0 CHECKPOINT**:
- TikTok API application submitted
- Research completed and documented
- Redis ready
- Test accounts configured
- Caption bank created
- **WAIT for API approval before proceeding to Week 1**

---

## 🗓️ WEEK 1: CORE INFRASTRUCTURE (After API Approval)

### **Day 1: Project Setup & Dependencies** (3-4 hours)

#### Morning: Dependencies Installation
```bash
npm install bull ioredis
npm install axios form-data
npm install bottleneck  # For rate limiting
```

#### Afternoon: Folder Structure
Create new directories:
```
src/
├── tiktok/
│   ├── auth.js          # OAuth & token management
│   ├── uploader.js      # TikTok upload logic
│   ├── validator.js     # Media validation
│   └── captionManager.js # Random caption selection
├── queue/
│   ├── producer.js      # Add jobs to queue
│   └── worker.js        # Process upload jobs
└── config.js            # Updated with TikTok settings
data/
└── captions.json        # Caption templates
```

#### Evening: Environment Variables
Update `.env`:
```bash
# TikTok API Configuration
TIKTOK_CLIENT_KEY=your_client_key
TIKTOK_CLIENT_SECRET=your_client_secret
TIKTOK_REDIRECT_URI=http://localhost:3000/auth/tiktok/callback
TIKTOK_ACCESS_TOKEN=  # Will be filled after OAuth
TIKTOK_REFRESH_TOKEN= # Will be filled after OAuth
TIKTOK_TOKEN_EXPIRES_AT= # Timestamp

# Redis Configuration
UPSTASH_REDIS_URL=redis://default:xxx@xxx.upstash.io:6379

# Upload Configuration
TIKTOK_UPLOAD_DELAY_MS=60000  # 1 minute between uploads
TIKTOK_MAX_RETRIES=3
TIKTOK_RETRY_DELAY_MS=300000  # 5 minutes

# Feature Flags
ENABLE_IMAGE_SEARCH=false  # Disable during TikTok implementation
ENABLE_TIKTOK_UPLOAD=true
```

Update `src/config.js`:
```javascript
module.exports = {
  // ... existing config ...

  // TikTok configuration
  tiktok: {
    clientKey: process.env.TIKTOK_CLIENT_KEY,
    clientSecret: process.env.TIKTOK_CLIENT_SECRET,
    redirectUri: process.env.TIKTOK_REDIRECT_URI,
    accessToken: process.env.TIKTOK_ACCESS_TOKEN,
    refreshToken: process.env.TIKTOK_REFRESH_TOKEN,
    tokenExpiresAt: parseInt(process.env.TIKTOK_TOKEN_EXPIRES_AT || '0', 10),
    uploadDelayMs: parseInt(process.env.TIKTOK_UPLOAD_DELAY_MS || '60000', 10),
    maxRetries: parseInt(process.env.TIKTOK_MAX_RETRIES || '3', 10),
    retryDelayMs: parseInt(process.env.TIKTOK_RETRY_DELAY_MS || '300000', 10)
  },

  // Feature flags
  enableImageSearch: process.env.ENABLE_IMAGE_SEARCH === 'true',
  enableTiktokUpload: process.env.ENABLE_TIKTOK_UPLOAD === 'true'
};
```

**✅ DAY 1 CHECKPOINT**: Dependencies installed, folder structure ready, config updated

---

### **Day 2: TikTok Authentication** (5-6 hours)

#### Create `src/tiktok/auth.js`

Implement:
- [ ] OAuth 2.0 authorization flow
- [ ] Token exchange (authorization code → access token)
- [ ] Token refresh mechanism (auto-refresh before expiration)
- [ ] Token storage (update `.env` file or use database)
- [ ] Token validation
- [ ] Automatic retry on auth errors

**Key Functions**:
```javascript
async function getAuthorizationUrl()  // Generate OAuth URL
async function exchangeCodeForToken(code)  // Get initial tokens
async function refreshAccessToken()  // Refresh expired token
async function getValidAccessToken()  // Returns valid token (auto-refresh if needed)
async function saveTokens(accessToken, refreshToken, expiresIn)  // Persist tokens
```

**OAuth Flow**:
1. Generate authorization URL → User visits and approves
2. Receive callback with authorization code
3. Exchange code for access token + refresh token
4. Save tokens to `.env`
5. Set up automatic refresh (check before each upload)

**Testing**:
- [ ] Run OAuth flow manually
- [ ] Get initial access token
- [ ] Test token refresh
- [ ] Verify tokens saved correctly

**✅ DAY 2 CHECKPOINT**: OAuth working, tokens obtained and saved

---

### **Day 3: Caption Manager** (2-3 hours)

#### Create `src/tiktok/captionManager.js`

Implement:
- [ ] Load captions from `data/captions.json`
- [ ] Random caption selection
- [ ] Caption validation (TikTok max length: 2200 chars)
- [ ] Default fallback caption
- [ ] Hashtag normalization

**Key Functions**:
```javascript
function loadCaptions()  // Load from JSON file
function getRandomCaption()  // Return random caption
function validateCaption(caption)  // Check length, format
function formatCaption(caption)  // Ensure proper formatting
```

**Caption Format**:
```json
[
  "Beautiful leather handbag collection 👜✨ #handbags #fashion #tanzania #leather",
  "New styles available! Premium quality bags 💼 #accessories #handbags",
  "Exclusive handbag designs 🔥 #fashion #tanzania #leather #style"
]
```

**Testing**:
- [ ] Load captions successfully
- [ ] Random selection works
- [ ] Validation catches too-long captions
- [ ] Default caption works if file missing

**✅ DAY 3 CHECKPOINT**: Caption system working

---

### **Day 4: Media Validator** (4-5 hours)

#### Create `src/tiktok/validator.js`

Based on TikTok API requirements (from Week 0 research), implement:

**Image Validation**:
- [ ] Supported formats: JPEG, PNG, WEBP
- [ ] File size: Check against TikTok limits (typically 1-10MB)
- [ ] Minimum dimensions: 720x720 pixels (verify from docs)
- [ ] Aspect ratios: 9:16, 1:1, 16:9 (verify from docs)
- [ ] File integrity: Valid image file

**Video Validation**:
- [ ] Supported formats: MP4, MOV
- [ ] File size: Check against TikTok limits (typically 30-500MB)
- [ ] Duration: Min/max duration (verify from docs)
- [ ] Resolution: Minimum resolution requirements
- [ ] Codec: H.264 or H.265 (verify from docs)

**Key Functions**:
```javascript
async function validateImage(filePath)  // Returns { valid, reason }
async function validateVideo(filePath)  // Returns { valid, reason }
async function validateMediaBatch(mediaPaths)  // Validate album
function getMediaType(mimetype)  // 'image' | 'video' | 'unknown'
function getFileSize(filePath)  // File size in bytes
async function getMediaDimensions(filePath)  // Width x height
```

**Testing**:
- [ ] Test with valid images
- [ ] Test with oversized images
- [ ] Test with wrong format
- [ ] Test with videos
- [ ] Test with corrupted files

**✅ DAY 4 CHECKPOINT**: Media validation working, invalid files rejected

---

### **Day 5-6: TikTok Uploader** (10-12 hours)

#### Create `src/tiktok/uploader.js`

This is the core upload logic. Based on TikTok API documentation:

**For Photo Posts/Albums**:
```javascript
async function uploadPhotoAlbum(imagePaths, caption) {
  // Step 1: Initialize photo post
  const initResponse = await initializePhotoPost(imagePaths.length)

  // Step 2: Upload each image
  for (const imagePath of imagePaths) {
    await uploadImageToUrl(imagePath, initResponse.upload_url)
  }

  // Step 3: Publish post
  const publishResponse = await publishPhotoPost(initResponse.publish_id, caption)

  return publishResponse
}
```

**For Video Posts**:
```javascript
async function uploadVideo(videoPath, caption) {
  // Step 1: Initialize video upload
  const initResponse = await initializeVideoUpload()

  // Step 2: Upload video file (chunked if large)
  await uploadVideoChunks(videoPath, initResponse.upload_url)

  // Step 3: Check upload status
  await waitForVideoProcessing(initResponse.video_id)

  // Step 4: Publish video
  const publishResponse = await publishVideo(initResponse.video_id, caption)

  return publishResponse
}
```

**Mixed Media Handling**:
```javascript
async function uploadAlbum(mediaPaths, caption) {
  // Separate images and videos
  const images = mediaPaths.filter(isImage)
  const videos = mediaPaths.filter(isVideo)

  // TikTok limitation: Can't mix images and videos in one post
  // Strategy: Post images as album, videos separately

  const results = []

  if (images.length > 0) {
    const result = await uploadPhotoAlbum(images, caption)
    results.push(result)
  }

  for (const video of videos) {
    const result = await uploadVideo(video, caption)
    results.push(result)
  }

  return results
}
```

**Rate Limiting**:
```javascript
const Bottleneck = require('bottleneck')

const limiter = new Bottleneck({
  minTime: 60000,  // 1 minute between requests
  maxConcurrent: 1  // Only one upload at a time
})

const uploadWithRateLimit = limiter.wrap(uploadAlbum)
```

**Error Handling**:
```javascript
async function uploadWithRetry(mediaPaths, caption, attempt = 1) {
  try {
    const result = await uploadWithRateLimit(mediaPaths, caption)
    return { success: true, result }
  } catch (error) {
    // Classify error
    if (isRetryableError(error) && attempt < config.tiktok.maxRetries) {
      console.log(`Upload failed (attempt ${attempt}), retrying...`)
      await sleep(config.tiktok.retryDelayMs)
      return uploadWithRetry(mediaPaths, caption, attempt + 1)
    }

    return { success: false, error: error.message, attempt }
  }
}

function isRetryableError(error) {
  // Network errors, 5xx errors, rate limits → retry
  const retryableCodes = [408, 429, 500, 502, 503, 504]
  return retryableCodes.includes(error.status) || error.code === 'ECONNRESET'
}
```

**Key Functions**:
```javascript
// Core upload functions
async function uploadAlbum(mediaPaths, caption)
async function uploadPhotoAlbum(imagePaths, caption)
async function uploadVideo(videoPath, caption)

// TikTok API calls
async function initializePhotoPost(imageCount)
async function uploadImageToUrl(imagePath, uploadUrl)
async function publishPhotoPost(publishId, caption)
async function initializeVideoUpload()
async function uploadVideoChunks(videoPath, uploadUrl)
async function publishVideo(videoId, caption)

// Utilities
async function uploadWithRetry(mediaPaths, caption, attempt)
function isRetryableError(error)
async function getValidToken()  // Uses auth.js
```

**Testing**:
- [ ] Test photo album upload (2-3 images)
- [ ] Test single video upload
- [ ] Test mixed media handling
- [ ] Test rate limiting (uploads 1 minute apart)
- [ ] Test retry on network error
- [ ] Test with invalid token (should refresh)
- [ ] Test with test TikTok account

**✅ DAY 5-6 CHECKPOINT**: TikTok upload working end-to-end

---

### **Day 7: Queue System** (5-6 hours)

#### Create `src/queue/producer.js`

```javascript
const Queue = require('bull')
const Redis = require('ioredis')
const config = require('../config')

// Redis connection
const redisClient = new Redis(config.redis.url, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false
})

// Create queue
const tiktokQueue = new Queue('tiktok-upload', {
  redis: config.redis.url,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 300000  // Start with 5 minutes
    },
    removeOnComplete: {
      age: 86400,  // Keep completed jobs for 24 hours
      count: 1000  // Keep last 1000 completed jobs
    },
    removeOnFail: false  // Keep failed jobs for manual review
  }
})

// Add job to queue
async function queueAlbumUpload(mediaData) {
  const jobData = {
    mediaPaths: mediaData.mediaPaths,
    groupId: mediaData.groupId,
    groupName: mediaData.groupName,
    messageId: mediaData.messageId,
    timestamp: mediaData.timestamp,
    queuedAt: Date.now()
  }

  const job = await tiktokQueue.add('upload-album', jobData)
  console.log(`📥 Queued TikTok upload: Job #${job.id} (${mediaData.mediaPaths.length} items)`)

  return job.id
}

// Get queue stats
async function getQueueStats() {
  const [waiting, active, completed, failed] = await Promise.all([
    tiktokQueue.getWaitingCount(),
    tiktokQueue.getActiveCount(),
    tiktokQueue.getCompletedCount(),
    tiktokQueue.getFailedCount()
  ])

  return { waiting, active, completed, failed }
}

module.exports = { queueAlbumUpload, getQueueStats, tiktokQueue }
```

#### Create `src/queue/worker.js`

```javascript
const { tiktokQueue } = require('./producer')
const { uploadAlbum } = require('../tiktok/uploader')
const { validateMediaBatch } = require('../tiktok/validator')
const { getRandomCaption } = require('../tiktok/captionManager')
const { getValidAccessToken } = require('../tiktok/auth')
const fs = require('fs').promises

// Process jobs
tiktokQueue.process('upload-album', 1, async (job) => {
  const { mediaPaths, groupName, messageId } = job.data

  console.log(`\n🎬 Processing TikTok upload job #${job.id}`)
  console.log(`   Group: ${groupName}`)
  console.log(`   Media count: ${mediaPaths.length}`)

  try {
    // 1. Validate token
    await getValidAccessToken()  // Will refresh if needed

    // 2. Validate media files
    const validation = await validateMediaBatch(mediaPaths)
    if (!validation.valid) {
      throw new Error(`Media validation failed: ${validation.reason}`)
    }

    // 3. Get random caption
    const caption = getRandomCaption()

    // 4. Upload to TikTok
    const result = await uploadAlbum(mediaPaths, caption)

    // 5. Cleanup temp files
    for (const path of mediaPaths) {
      try {
        await fs.unlink(path)
        console.log(`🗑️  Deleted temp file: ${path}`)
      } catch (err) {
        console.warn(`Warning: Could not delete ${path}:`, err.message)
      }
    }

    console.log(`✅ TikTok upload complete: Job #${job.id}`)
    return result

  } catch (error) {
    console.error(`❌ TikTok upload failed: Job #${job.id}`, error.message)
    throw error  // Will trigger retry
  }
})

// Event listeners
tiktokQueue.on('active', (job) => {
  console.log(`⚡ Job #${job.id} started`)
})

tiktokQueue.on('completed', (job, result) => {
  console.log(`✅ Job #${job.id} completed`)
})

tiktokQueue.on('failed', (job, err) => {
  console.error(`❌ Job #${job.id} failed:`, err.message)

  // Log to dead letter queue if all retries exhausted
  if (job.attemptsMade >= job.opts.attempts) {
    console.error(`💀 Job #${job.id} moved to DLQ after ${job.attemptsMade} attempts`)
  }
})

tiktokQueue.on('error', (error) => {
  console.error('Queue error:', error)
})

console.log('🔧 TikTok upload worker started')

module.exports = { tiktokQueue }
```

**Testing**:
- [ ] Add test job to queue
- [ ] Verify worker picks up job
- [ ] Verify 1-minute delay between jobs
- [ ] Verify retry on failure
- [ ] Verify temp file cleanup

**✅ DAY 7 CHECKPOINT**: Queue system operational

---

## 🗓️ WEEK 2: INTEGRATION WITH WHATSAPP BOT

### **Day 8: Message Handler Integration** (4-5 hours)

#### Modify `src/handlers/messageHandler.js`

**Step 1**: Add feature flag check at the top:
```javascript
const config = require('../config')
const { queueAlbumUpload } = require('../queue/producer')

// At the start of handleGroupMessage function
async function handleGroupMessage(msg, db, client) {
  const groupId = msg.from

  try {
    const chat = await msg.getChat()
    const groupName = chat.name || 'Unknown Group'

    console.log(`\n📨 Received message in group: ${groupName} (${groupId})`)

    // FEATURE FLAG: Route to appropriate handler
    if (config.enableTiktokUpload) {
      await handleTiktokUpload(msg, groupId, groupName)
      return  // Skip image search functionality
    }

    if (config.enableImageSearch) {
      // ... existing image search logic ...
    }
  } catch (err) {
    console.error('Error handling group message:', err.message)
  }
}
```

**Step 2**: Create new handler function:
```javascript
async function handleTiktokUpload(msg, groupId, groupName) {
  // Check if message is from supplier group
  if (!config.supplierGroupIds.includes(groupId)) {
    return  // Ignore non-supplier groups
  }

  // Check if message has media
  if (!msg.hasMedia) {
    return  // No media to upload
  }

  console.log(`📸 Media detected in supplier group: ${groupName}`)

  try {
    // Download all media from message
    const mediaPaths = []

    // WhatsApp sends album images as separate messages in quick succession
    // For single message, download the media
    const media = await msg.downloadMedia()

    if (media) {
      // Save to temp file
      const tempPath = await saveMediaToTemp(media, msg.id._serialized)
      mediaPaths.push(tempPath)
    }

    // If we have media, queue for upload
    if (mediaPaths.length > 0) {
      await queueAlbumUpload({
        mediaPaths,
        groupId,
        groupName,
        messageId: msg.id._serialized,
        timestamp: msg.timestamp
      })

      console.log(`✅ Queued ${mediaPaths.length} media items for TikTok upload`)
    }

  } catch (error) {
    console.error('Error handling TikTok upload:', error.message)
  }
}

// Helper function to save media to temp
async function saveMediaToTemp(media, messageId) {
  const fs = require('fs').promises
  const path = require('path')
  const crypto = require('crypto')

  // Generate unique filename
  const hash = crypto.createHash('md5').update(messageId).digest('hex').substring(0, 8)
  const timestamp = Date.now()
  const ext = media.mimetype.split('/')[1] || 'jpg'
  const filename = `${timestamp}_${hash}.${ext}`

  // Save to data/temp/
  const tempDir = path.join(__dirname, '../../data/temp')
  await fs.mkdir(tempDir, { recursive: true })

  const filePath = path.join(tempDir, filename)
  await fs.writeFile(filePath, Buffer.from(media.data, 'base64'))

  console.log(`💾 Saved temp file: ${filename}`)
  return filePath
}
```

**Step 3**: Handle WhatsApp albums (multiple images in quick succession)

WhatsApp sends album images as separate messages within ~1 second. Need to batch them:

```javascript
// Track album batches
const albumBatches = new Map()
const ALBUM_WINDOW_MS = 2000  // 2 seconds to collect album

async function handleTiktokUpload(msg, groupId, groupName) {
  if (!config.supplierGroupIds.includes(groupId)) return
  if (!msg.hasMedia) return

  const batchKey = `${groupId}_${msg.timestamp}`

  try {
    // Download media
    const media = await msg.downloadMedia()
    if (!media) return

    const tempPath = await saveMediaToTemp(media, msg.id._serialized)

    // Add to batch
    if (!albumBatches.has(batchKey)) {
      albumBatches.set(batchKey, {
        mediaPaths: [],
        groupId,
        groupName,
        timer: null
      })
    }

    const batch = albumBatches.get(batchKey)
    batch.mediaPaths.push(tempPath)

    // Clear existing timer
    if (batch.timer) {
      clearTimeout(batch.timer)
    }

    // Set new timer - queue after no new images for 2 seconds
    batch.timer = setTimeout(async () => {
      console.log(`📦 Album batch complete: ${batch.mediaPaths.length} items`)

      await queueAlbumUpload({
        mediaPaths: batch.mediaPaths,
        groupId: batch.groupId,
        groupName: batch.groupName,
        messageId: msg.id._serialized,
        timestamp: msg.timestamp
      })

      albumBatches.delete(batchKey)
    }, ALBUM_WINDOW_MS)

  } catch (error) {
    console.error('Error handling TikTok upload:', error.message)
  }
}
```

**Testing**:
- [ ] Send single image in supplier group → queued
- [ ] Send album (3 images) → batched and queued as one job
- [ ] Send video → queued
- [ ] Send image in non-supplier group → ignored
- [ ] Feature flag works (can switch between TikTok and image search)

**✅ DAY 8 CHECKPOINT**: WhatsApp integration complete

---

### **Day 9: Worker Process Setup** (3-4 hours)

#### Update `package.json` scripts:
```json
{
  "scripts": {
    "start": "node src/index.js",
    "worker": "node src/queue/worker.js",
    "dev": "./start-bot.sh",
    "dev:worker": "nodemon src/queue/worker.js"
  }
}
```

#### Create worker startup script `start-worker.sh`:
```bash
#!/bin/bash
echo "🚀 Starting TikTok upload worker..."
node src/queue/worker.js
```

Make executable:
```bash
chmod +x start-worker.sh
```

#### Create combined startup script `start-all.sh`:
```bash
#!/bin/bash

echo "🚀 Starting WhatsApp Bot + TikTok Worker..."

# Start main bot in background
node src/index.js &
BOT_PID=$!

# Start worker in background
node src/queue/worker.js &
WORKER_PID=$!

echo "✅ Bot PID: $BOT_PID"
echo "✅ Worker PID: $WORKER_PID"

# Wait for both processes
wait $BOT_PID $WORKER_PID
```

**Process Management**:
- Main bot (`npm start`): Handles WhatsApp, queues jobs
- Worker (`npm run worker`): Processes upload queue
- Both must run simultaneously

**Testing**:
- [ ] Start main bot → WhatsApp connects
- [ ] Start worker separately → connects to Redis
- [ ] Send test image → bot queues, worker processes
- [ ] Stop worker → jobs wait in queue
- [ ] Restart worker → resumes processing

**✅ DAY 9 CHECKPOINT**: Dual-process architecture working

---

### **Day 10: End-to-End Testing** (6-8 hours)

#### Test Scenarios

**Basic Flow**:
- [ ] Send single image → uploads to TikTok
- [ ] Send album (3 images) → uploads as one carousel
- [ ] Send video → uploads as video post
- [ ] Send mixed (2 images + 1 video) → creates 2 posts

**Rate Limiting**:
- [ ] Send 3 albums quickly → uploads 1 minute apart
- [ ] Verify queue doesn't process in parallel

**Error Handling**:
- [ ] Send invalid image (wrong format) → job fails, logs error
- [ ] Send oversized video → validation fails, skipped
- [ ] Disconnect internet mid-upload → retries successfully
- [ ] Invalid access token → auto-refreshes and continues

**Edge Cases**:
- [ ] Restart bot mid-upload → worker continues
- [ ] Restart worker mid-upload → resumes from queue
- [ ] Send 10 albums → all process sequentially
- [ ] Clear Redis → jobs lost (expected - document)

**Feature Flag**:
- [ ] Set `ENABLE_TIKTOK_UPLOAD=false` → no uploads
- [ ] Set `ENABLE_IMAGE_SEARCH=true` → reverts to old behavior
- [ ] Toggle between modes → works correctly

**Monitoring**:
- [ ] Check queue stats → waiting/active/completed counts
- [ ] Check Redis → jobs visible
- [ ] Check TikTok account → posts appearing
- [ ] Check logs → clear error messages

**✅ DAY 10 CHECKPOINT**: All test scenarios passing

---

## 🗓️ WEEK 3: RELIABILITY & MONITORING

### **Day 11: Error Handling Enhancement** (4-5 hours)

#### Improve Error Classification in `src/tiktok/uploader.js`:

```javascript
class TikTokUploadError extends Error {
  constructor(message, type, retryable = false) {
    super(message)
    this.name = 'TikTokUploadError'
    this.type = type  // 'network', 'validation', 'auth', 'rate_limit', 'api_error'
    this.retryable = retryable
  }
}

function classifyError(error) {
  // Network errors
  if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
    return new TikTokUploadError(error.message, 'network', true)
  }

  // Rate limiting
  if (error.status === 429) {
    return new TikTokUploadError('Rate limit exceeded', 'rate_limit', true)
  }

  // Authentication errors
  if (error.status === 401 || error.status === 403) {
    return new TikTokUploadError('Authentication failed', 'auth', true)
  }

  // Server errors (5xx)
  if (error.status >= 500) {
    return new TikTokUploadError(`Server error: ${error.status}`, 'api_error', true)
  }

  // Client errors (4xx) - usually not retryable
  if (error.status >= 400 && error.status < 500) {
    return new TikTokUploadError(`Client error: ${error.status}`, 'validation', false)
  }

  // Unknown error
  return new TikTokUploadError(error.message, 'unknown', false)
}
```

#### Add Dead Letter Queue Handler:

```javascript
// In worker.js
async function handleDeadLetterJob(job) {
  const dlqPath = path.join(__dirname, '../../logs/dlq.json')

  const dlqEntry = {
    jobId: job.id,
    data: job.data,
    failedAt: new Date().toISOString(),
    attempts: job.attemptsMade,
    error: job.failedReason,
    stackTrace: job.stacktrace
  }

  // Append to DLQ file
  let dlq = []
  try {
    const existing = await fs.readFile(dlqPath, 'utf8')
    dlq = JSON.parse(existing)
  } catch (err) {
    // File doesn't exist yet
  }

  dlq.push(dlqEntry)
  await fs.writeFile(dlqPath, JSON.stringify(dlq, null, 2))

  console.log(`💀 Job #${job.id} added to DLQ`)
}

tiktokQueue.on('failed', async (job, err) => {
  if (job.attemptsMade >= job.opts.attempts) {
    await handleDeadLetterJob(job)
  }
})
```

**Testing**:
- [ ] Force network error → retries
- [ ] Force validation error → doesn't retry
- [ ] Exhaust retries → moves to DLQ
- [ ] Check `logs/dlq.json` → failed jobs logged

**✅ DAY 11 CHECKPOINT**: Robust error handling implemented

---

### **Day 12: Logging System** (3-4 hours)

#### Install Winston logger:
```bash
npm install winston winston-daily-rotate-file
```

#### Create `src/utils/logger.js`:

```javascript
const winston = require('winston')
const DailyRotateFile = require('winston-daily-rotate-file')
const path = require('path')

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack }) => {
    return `${timestamp} [${level.toUpperCase()}]: ${message}${stack ? '\n' + stack : ''}`
  })
)

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    // Console output
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        logFormat
      )
    }),

    // Daily rotating file - all logs
    new DailyRotateFile({
      filename: path.join(__dirname, '../../logs/app-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d'
    }),

    // Error logs only
    new DailyRotateFile({
      filename: path.join(__dirname, '../../logs/error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '30d'
    })
  ]
})

module.exports = logger
```

#### Replace console.log with logger:

```javascript
// In worker.js
const logger = require('../utils/logger')

tiktokQueue.process('upload-album', 1, async (job) => {
  logger.info(`Processing TikTok upload job #${job.id}`)

  try {
    // ... upload logic ...
    logger.info(`TikTok upload complete: Job #${job.id}`)
  } catch (error) {
    logger.error(`TikTok upload failed: Job #${job.id}`, { error: error.message })
    throw error
  }
})
```

**Testing**:
- [ ] Logs written to `logs/app-2026-02-12.log`
- [ ] Errors written to `logs/error-2026-02-12.log`
- [ ] Log rotation works (files by date)
- [ ] Old logs auto-deleted after retention period

**✅ DAY 12 CHECKPOINT**: Professional logging in place

---

### **Day 13: Simple Dashboard** (4-5 hours)

#### Install Bull Board:
```bash
npm install @bull-board/express @bull-board/api
```

#### Create `src/dashboard/server.js`:

```javascript
const express = require('express')
const { createBullBoard } = require('@bull-board/api')
const { BullAdapter } = require('@bull-board/api/bullAdapter')
const { ExpressAdapter } = require('@bull-board/express')
const { tiktokQueue } = require('../queue/producer')

const serverAdapter = new ExpressAdapter()
serverAdapter.setBasePath('/admin/queues')

createBullBoard({
  queues: [new BullAdapter(tiktokQueue)],
  serverAdapter: serverAdapter
})

const app = express()

// Dashboard route
app.use('/admin/queues', serverAdapter.getRouter())

// Health check
app.get('/health', async (req, res) => {
  const stats = await getQueueStats()
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    queue: stats
  })
})

// Simple stats page
app.get('/', async (req, res) => {
  const stats = await getQueueStats()
  res.send(`
    <html>
      <head><title>TikTok Upload Dashboard</title></head>
      <body style="font-family: Arial; padding: 20px;">
        <h1>🎬 TikTok Auto-Upload Dashboard</h1>
        <h2>Queue Status</h2>
        <ul>
          <li>Waiting: ${stats.waiting}</li>
          <li>Active: ${stats.active}</li>
          <li>Completed: ${stats.completed}</li>
          <li>Failed: ${stats.failed}</li>
        </ul>
        <p><a href="/admin/queues">View Detailed Queue</a></p>
        <p><a href="/health">Health Check (JSON)</a></p>
      </body>
    </html>
  `)
})

const PORT = process.env.DASHBOARD_PORT || 3000
app.listen(PORT, () => {
  console.log(`📊 Dashboard running at http://localhost:${PORT}`)
  console.log(`📊 Bull Board at http://localhost:${PORT}/admin/queues`)
})

module.exports = app
```

#### Update `package.json`:
```json
{
  "scripts": {
    "dashboard": "node src/dashboard/server.js",
    "dev:dashboard": "nodemon src/dashboard/server.js"
  }
}
```

**Testing**:
- [ ] Start dashboard: `npm run dashboard`
- [ ] Visit `http://localhost:3000`
- [ ] View queue stats
- [ ] Visit Bull Board at `/admin/queues`
- [ ] Monitor jobs in real-time

**✅ DAY 13 CHECKPOINT**: Dashboard accessible

---

### **Day 14: Cleanup & Optimization** (3-4 hours)

#### Enhance Temp File Cleanup

Update `src/tasks/cleanup.js`:

```javascript
const fs = require('fs').promises
const path = require('path')
const logger = require('../utils/logger')

async function cleanupTempFiles() {
  const tempDir = path.join(__dirname, '../../data/temp')
  const maxAgeHours = 24

  try {
    const files = await fs.readdir(tempDir)
    const now = Date.now()
    let deletedCount = 0

    for (const file of files) {
      const filePath = path.join(tempDir, file)
      const stats = await fs.stat(filePath)
      const ageHours = (now - stats.mtimeMs) / (1000 * 60 * 60)

      if (ageHours > maxAgeHours) {
        await fs.unlink(filePath)
        deletedCount++
      }
    }

    if (deletedCount > 0) {
      logger.info(`🗑️  Cleanup: Deleted ${deletedCount} old temp files`)
    }
  } catch (error) {
    logger.error('Cleanup failed:', { error: error.message })
  }
}

// Run every hour
const cron = require('node-cron')
cron.schedule('0 * * * *', cleanupTempFiles)

module.exports = { cleanupTempFiles }
```

#### Optimize Queue Settings

Based on testing, tune settings in `src/queue/producer.js`:

```javascript
defaultJobOptions: {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 300000  // 5 min, 10 min, 20 min
  },
  timeout: 600000,  // 10 minute timeout per job
  removeOnComplete: {
    age: 86400,  // 24 hours
    count: 1000
  }
}
```

**Testing**:
- [ ] Run cleanup manually → old files deleted
- [ ] Schedule runs every hour
- [ ] Queue settings optimal for workload

**✅ DAY 14 CHECKPOINT**: System optimized

---

## 🗓️ WEEK 4: DEPLOYMENT & PRODUCTION

### **Day 15-16: Railway Deployment** (8-10 hours)

#### Day 15 Morning: Prepare for Deployment

**1. Create `.env.production`**:
```bash
NODE_ENV=production
ENABLE_IMAGE_SEARCH=false
ENABLE_TIKTOK_UPLOAD=true

# TikTok (will set in Railway dashboard)
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
TIKTOK_REDIRECT_URI=
TIKTOK_ACCESS_TOKEN=
TIKTOK_REFRESH_TOKEN=
TIKTOK_TOKEN_EXPIRES_AT=

# Redis (Upstash)
UPSTASH_REDIS_URL=

# Other configs...
```

**2. Update `.gitignore`**:
```
.env
.env.production
.wwebjs_auth/
data/temp/*
!data/temp/.gitkeep
logs/*
!logs/.gitkeep
node_modules/
```

**3. Create `Procfile`** (for Railway):
```
web: node src/index.js
worker: node src/queue/worker.js
```

**4. Verify `package.json` engines**:
```json
{
  "engines": {
    "node": ">=18.0.0 <=22.x",
    "npm": ">=9.0.0"
  }
}
```

#### Day 15 Afternoon: Railway Setup

**1. Sign up for Railway**: https://railway.app

**2. Create new project**:
- Click "New Project"
- Select "Deploy from GitHub repo"
- Connect your repository
- Select branch: `main`

**3. Configure services**:
Railway will need **TWO services**:
- Service 1: **Main Bot** (WhatsApp client)
- Service 2: **Worker** (TikTok uploader)

**4. Set environment variables** in Railway dashboard:
- Copy all from `.env.production`
- Add TikTok credentials
- Add Upstash Redis URL
- Set `RAILWAY_ENVIRONMENT=production`

**5. Configure build**:
- Build command: `npm install --production`
- Start command (Main): `node src/index.js`
- Start command (Worker): `node src/queue/worker.js`

#### Day 16 Morning: Deploy & Test

**1. Deploy main bot**:
```bash
git push origin main
```

Railway auto-deploys.

**2. Deploy worker as second service**:
- In Railway: Add new service
- Same repo, different start command
- Share environment variables

**3. Monitor deployment**:
- Check Railway logs
- Verify both services running
- Check for errors

**4. Test WhatsApp connection**:
- Main bot should generate QR code in logs
- Scan QR code with WhatsApp
- Verify connection successful

#### Day 16 Afternoon: Production Testing

- [ ] Send test image in supplier group
- [ ] Verify queued in Redis (check Bull Board)
- [ ] Verify worker picks up job
- [ ] Verify uploads to TikTok
- [ ] Check TikTok account for post
- [ ] Monitor logs for errors
- [ ] Test token refresh
- [ ] Test error handling

**✅ DAY 15-16 CHECKPOINT**: System deployed and running

---

### **Day 17: Live Operation Monitoring** (4-6 hours)

#### Monitor closely for first 24 hours:

**Checklist**:
- [ ] Check Railway dashboard every hour
- [ ] Monitor queue length (should stay < 10)
- [ ] Verify uploads happening every minute
- [ ] Check TikTok account for new posts
- [ ] Monitor memory usage (should be stable)
- [ ] Check for error spikes in logs
- [ ] Verify no WhatsApp disconnections
- [ ] Ensure temp files being cleaned up

**Metrics to Track**:
```
Total albums uploaded: ___
Success rate: ____%
Average queue time: ___ minutes
Longest queue: ___ jobs
Errors encountered: ___
Memory usage: ___ MB
```

**Common Issues & Fixes**:

| Issue | Solution |
|-------|----------|
| WhatsApp disconnects | Restart main service, rescan QR |
| Worker stops processing | Restart worker service |
| Queue backing up | Check rate limiting, increase worker count (not recommended) |
| Token expired | Should auto-refresh, check auth logs |
| Memory leak | Restart services, investigate |

**✅ DAY 17 CHECKPOINT**: System stable under real load

---

### **Day 18: Documentation** (3-4 hours)

#### Create `TIKTOK_OPERATIONS.md`:

```markdown
# TikTok Auto-Upload Operations Guide

## System Overview
- **Main Bot**: Monitors WhatsApp supplier groups, queues uploads
- **Worker**: Processes upload queue, posts to TikTok
- **Redis**: Job queue (Upstash)

## Daily Operations

### Check System Health
1. Visit Railway dashboard: https://railway.app/project/...
2. Verify both services running
3. Check logs for errors
4. Visit Bull Board: http://your-url/admin/queues

### Monitor Uploads
- Check TikTok account: @kleva_handbags
- Expected: ~50-100 posts/day
- Verify captions look good
- Verify images/videos display correctly

### Handle Errors

#### Failed Jobs
1. Check Bull Board → Failed Jobs
2. Review error message
3. Common fixes:
   - Invalid media → ignore (will be filtered next time)
   - Network error → retry manually
   - Token expired → check auth logs, may need to re-auth

#### Dead Letter Queue
Location: `logs/dlq.json`

Review weekly:
```bash
cat logs/dlq.json | jq
```

Manually retry if needed (implement retry script if necessary).

## Configuration

### Environment Variables
- `ENABLE_TIKTOK_UPLOAD`: true/false
- `TIKTOK_UPLOAD_DELAY_MS`: Delay between uploads (default: 60000)
- `TIKTOK_MAX_RETRIES`: Retry attempts (default: 3)

### Update Captions
Edit `data/captions.json`, push to GitHub, Railway auto-deploys.

### Add/Remove Supplier Groups
1. Edit `.env`: `SUPPLIER_GROUP_IDS`
2. Push to GitHub
3. Restart main service

## Troubleshooting

### No uploads happening
1. Check queue is empty: Bull Board
2. Check worker logs: Railway → Worker service → Logs
3. Verify WhatsApp connected: Main service logs
4. Check Redis connection: Both service logs

### WhatsApp disconnected
1. Railway → Main service → Logs
2. Find QR code in logs (or restart to regenerate)
3. Scan with WhatsApp

### Memory issues
1. Check Railway metrics
2. If > 500MB, restart services
3. Investigate cleanup job (should run hourly)

## Emergency Procedures

### Pause uploads
Set `ENABLE_TIKTOK_UPLOAD=false` in Railway, redeploy.

### Clear queue
Access Redis via Upstash dashboard, flush `bull:tiktok-upload:*` keys.

### Full restart
1. Restart both services in Railway
2. Rescan WhatsApp QR code
3. Verify worker reconnects to Redis
4. Test with single image

## Maintenance

### Weekly
- [ ] Review failed jobs
- [ ] Check DLQ
- [ ] Review error logs
- [ ] Verify cleanup running

### Monthly
- [ ] Review caption performance (engagement)
- [ ] Update captions if needed
- [ ] Check Upstash Redis usage (free tier limits)
- [ ] Review Railway costs

## Contacts
- TikTok Account: @kleva_handbags
- Railway Project: [URL]
- Upstash Redis: [URL]
```

#### Update main `README.md`:

Add section:
```markdown
## TikTok Auto-Upload Feature

Automatically posts supplier images/videos to TikTok.

See [TIKTOK_OPERATIONS.md](TIKTOK_OPERATIONS.md) for details.

### Quick Start
1. Enable feature: `ENABLE_TIKTOK_UPLOAD=true`
2. Disable image search: `ENABLE_IMAGE_SEARCH=false`
3. Start bot: `npm start`
4. Start worker: `npm run worker`
```

**✅ DAY 18 CHECKPOINT**: Documentation complete

---

## 📊 SUCCESS CRITERIA

After Week 4, the system should have:

### ✅ Functionality
- [x] Detects media from supplier groups
- [x] Batches album images together
- [x] Uploads to TikTok sequentially
- [x] 1-minute delay between uploads
- [x] Random caption selection
- [x] Media validation (no manipulation)
- [x] OAuth token auto-refresh
- [x] Error handling with retries
- [x] Temp file cleanup

### ✅ Performance
- [x] Uploads 50-100 albums/day
- [x] 95%+ success rate
- [x] Queue stays under 20 jobs
- [x] < 2 minutes average processing time
- [x] No memory leaks

### ✅ Reliability
- [x] Auto-recovery from failures
- [x] No lost jobs
- [x] Dead letter queue for failed jobs
- [x] Graceful error handling

### ✅ Monitoring
- [x] Bull Board dashboard
- [x] Health check endpoint
- [x] Structured logging
- [x] DLQ tracking

### ✅ Documentation
- [x] Operations guide
- [x] Troubleshooting procedures
- [x] Configuration guide
- [x] Emergency procedures

---

## 💰 COST ESTIMATE

### Development
- **Time**: 4-6 weeks
- **Cost**: $0 (your time)

### Monthly Operating Costs
| Service | Plan | Cost |
|---------|------|------|
| Railway - Main Bot | 512MB | $5 |
| Railway - Worker | 512MB | $5 |
| Upstash Redis | Free tier | $0 |
| TikTok API | Free | $0 |
| **Total** | | **$10/month** |

### Scaling Costs (if needed)
- Railway 1GB (both services): $20/month
- Upstash paid tier: $10/month
- **Total with scaling**: $30/month

---

## 🚨 RISKS & MITIGATION

### Risk 1: TikTok API doesn't support albums
**Likelihood**: Medium
**Impact**: High
**Mitigation**: Research thoroughly in Week 0. If no album support, post images individually.

### Risk 2: TikTok API approval delayed/rejected
**Likelihood**: Medium
**Impact**: High
**Mitigation**: Apply immediately. Have fallback plan (manual posting service).

### Risk 3: Rate limits more restrictive than expected
**Likelihood**: Low
**Impact**: Medium
**Mitigation**: Implement flexible rate limiter. Can adjust delays easily.

### Risk 4: WhatsApp bans the number
**Likelihood**: Low
**Impact**: High
**Mitigation**: Use WhatsApp Business API (paid) for production. Have backup number.

### Risk 5: Redis free tier insufficient
**Likelihood**: Low
**Impact**: Low
**Mitigation**: Monitor usage. Upgrade to paid tier ($10/month) if needed.

---

## 🎯 NEXT STEPS

### Immediate (Today)
1. [ ] Apply for TikTok Content Posting API access
2. [ ] Set up TikTok Business account
3. [ ] Sign up for Upstash Redis
4. [ ] Create `data/captions.json` with initial captions

### Week 0 (While waiting for approval)
1. [ ] Research TikTok API documentation
2. [ ] Test OAuth flow in sandbox
3. [ ] Document API limitations
4. [ ] Set up Railway account

### Week 1 (After approval)
1. [ ] Begin implementation following this plan
2. [ ] Day-by-day task completion
3. [ ] Test thoroughly at each checkpoint

### Week 2-4
1. [ ] Complete integration
2. [ ] Deploy to production
3. [ ] Monitor and optimize

---

## 📞 SUPPORT

If issues arise:
1. Check `TIKTOK_OPERATIONS.md` for common solutions
2. Review error logs in `logs/error-*.log`
3. Check Bull Board for queue status
4. Review TikTok API documentation
5. Check Railway service logs

---

**Last Updated**: 2026-02-12
**Status**: Planning Phase
**Next Milestone**: TikTok API approval
