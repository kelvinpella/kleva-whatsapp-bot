# Railway Deployment Guide

Complete guide to deploying the WhatsApp Handbag Search Bot to Railway.app

## Prerequisites

- GitHub account
- Railway account (sign up at https://railway.app)
- WhatsApp account for bot authentication
- Supabase project already set up (completed in Phase 1)

---

## Step 1: Prepare Repository

### 1.1 Ensure all changes are committed and pushed

```bash
git status
git push origin main
```

### 1.2 Verify important files exist

- ✅ `package.json` with `"start": "node ."` script
- ✅ `railway.json` configuration
- ✅ `.gitignore` (excludes .env, node_modules, .wwebjs_auth)
- ✅ `main.js` entry point

---

## Step 2: Create Railway Project

### 2.1 Sign up / Login to Railway

1. Go to https://railway.app
2. Click "Login" and authenticate with GitHub
3. Grant Railway access to your repositories

### 2.2 Create New Project

1. Click "New Project"
2. Select "Deploy from GitHub repo"
3. Choose `kelvinpella/kleva-whatsapp-bot`
4. Railway will automatically detect Node.js and configure build

---

## Step 3: Configure Environment Variables

### 3.1 Add Environment Variables in Railway Dashboard

Go to your project → Variables tab → Add the following:

```env
# Environment
NODE_ENV=production

# Bot Configuration
YOUR_PHONE_NUMBER=+255XXXXXXXXXX
CLEANUP_DAYS=30
MIN_SIMILARITY=0.4

# Image Processing
HANDBAG_CONFIDENCE_THRESHOLD=0.5
MAX_IMAGES_PER_MESSAGE=2
MAX_IMAGE_SIZE_KB=5000

# Supabase Configuration
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_KEY=your_supabase_anon_key_here
SUPABASE_STORAGE_BUCKET=handbags
```

**⚠️ Important:** Replace `SUPABASE_KEY` with your actual Supabase anon/public key

### 3.2 Optional: Supplier Group IDs (if needed in future)

```env
SUPPLIER_GROUP_IDS=120363424482974321@g.us,120363123456789012@g.us
```

---

## Step 4: Configure Puppeteer Dependencies

Railway needs Chromium dependencies for `whatsapp-web.js` (which uses Puppeteer).

### 4.1 Create `nixpacks.toml` in project root

```toml
[phases.setup]
aptPkgs = [
  "chromium",
  "chromium-sandbox",
  "ca-certificates",
  "fonts-liberation",
  "libappindicator3-1",
  "libasound2",
  "libatk-bridge2.0-0",
  "libatk1.0-0",
  "libcups2",
  "libdbus-1-3",
  "libdrm2",
  "libgbm1",
  "libgtk-3-0",
  "libnspr4",
  "libnss3",
  "libx11-xcb1",
  "libxcomposite1",
  "libxdamage1",
  "libxrandr2",
  "xdg-utils"
]

[phases.install]
cmds = ["npm install"]

[start]
cmd = "npm start"
```

**Note:** This file will be created in the next step.

---

## Step 5: Deploy the Bot

### 5.1 Initial Deployment

1. Railway automatically starts deploying after repo connection
2. Monitor build logs in Railway dashboard
3. Wait for "Build successful" message
4. Check deployment logs for any errors

### 5.2 Verify Deployment

Look for these messages in logs:
```
✓ WhatsApp bot initialized successfully
📱 QR Code received — scan with WhatsApp on your phone
```

---

## Step 6: Authenticate WhatsApp

### 6.1 View QR Code in Logs

1. Go to Railway dashboard → Your project → Deployments tab
2. Click on latest deployment
3. View logs
4. Look for QR code in ASCII format

### 6.2 Scan QR Code

1. Open WhatsApp on your phone
2. Go to Settings → Linked Devices
3. Tap "Link a Device"
4. Scan the QR code from Railway logs

### 6.3 Verify Authentication

Wait for log message:
```
✓ Authentication successful! Session is being saved...
✓ Client is ready and session is persisted!
📊 Monitoring X supplier groups
```

---

## Step 7: Test the Bot

### 7.1 Test Image Indexing (Supplier Groups)

1. Post a handbag image in one of your supplier WhatsApp groups
2. Check Railway logs for processing messages:
   ```
   📨 New message from [group_id]
   🖼️  Processing images from [group_name]
   ✅ Saved image to database
   ```

### 7.2 Test Image Search (Private Chat)

1. Send a handbag image with `/search` to the bot's WhatsApp number
2. Wait for response with:
   - Supplier name
   - Image
   - Date posted
   - Match percentage

---

## Step 8: Monitor and Maintain

### 8.1 View Logs

Railway dashboard → Deployments → Click deployment → View logs

### 8.2 Restart Bot (if needed)

Railway dashboard → Deployments → Click "..." → Restart

### 8.3 Check Resource Usage

Railway dashboard → Metrics tab
- Memory usage
- CPU usage
- Network traffic

### 8.4 Cost Monitoring

Railway dashboard → Usage tab
- $5 free credits monthly
- Estimated monthly cost
- Usage breakdown

---

## Troubleshooting

### Issue: QR Code Not Appearing

**Solution:**
- Check logs for Puppeteer errors
- Verify `nixpacks.toml` has Chromium dependencies
- Redeploy the service

### Issue: "Session is not authenticated"

**Solution:**
- Clear Railway volume (Railway dashboard → Settings → Reset volume)
- Redeploy and scan QR code again

### Issue: Bot disconnects frequently

**Solution:**
- Check WhatsApp phone is connected to internet
- Verify linked devices in WhatsApp settings
- Check Railway logs for error messages
- Ensure Railway service isn't sleeping (should not on paid plan)

### Issue: Out of memory errors

**Solution:**
- Upgrade Railway plan for more memory
- Check image processing isn't leaking memory
- Verify cleanup tasks are running

### Issue: Images not saving to Supabase

**Solution:**
- Verify `SUPABASE_KEY` is correct in Railway variables
- Check Supabase storage bucket exists (`handbags`)
- Verify Supabase storage policies allow uploads
- Check Railway logs for specific error messages

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | Yes | `development` | Set to `production` for Railway |
| `YOUR_PHONE_NUMBER` | Yes | - | Your WhatsApp number (international format) |
| `SUPABASE_URL` | Yes | - | Your Supabase project URL |
| `SUPABASE_KEY` | Yes | - | Your Supabase anon/public key |
| `SUPABASE_STORAGE_BUCKET` | Yes | `handbags` | Supabase storage bucket name |
| `MIN_SIMILARITY` | No | `0.7` | Minimum match threshold (0.0-1.0) |
| `CLEANUP_DAYS` | No | `30` | Days before auto-deleting old images |
| `HANDBAG_CONFIDENCE_THRESHOLD` | No | `0.5` | COCO-SSD confidence for handbag detection |
| `MAX_IMAGES_PER_MESSAGE` | No | `2` | Max images to process per message |
| `MAX_IMAGE_SIZE_KB` | No | `5000` | Max image file size in KB |

---

## Cost Estimate

**Railway Pricing (as of 2024):**
- $5 free credits per month
- Usage-based pricing after free credits
- Estimated cost: $5-10/month for this bot

**Cost Breakdown:**
- Memory: ~512MB constant usage
- CPU: Low (spikes during image processing)
- Network: Moderate (downloading/uploading images)
- Storage: Minimal (session data only, images in Supabase)

**Supabase Pricing:**
- Free tier: 500MB database, 1GB storage
- Estimated: Free tier sufficient for testing
- Paid: $25/month if exceeding free limits

---

## Next Steps

After successful deployment:

1. ✅ Monitor logs for 24 hours to ensure stability
2. ✅ Test with real supplier images
3. ✅ Set up automated cleanup tasks (Phase 4, Day 11)
4. ✅ Configure monitoring/alerts (Phase 4, Day 11)
5. ✅ Complete documentation (Phase 4, Day 13)

---

## Support

- Railway Docs: https://docs.railway.app
- Railway Discord: https://discord.gg/railway
- WhatsApp Web.js: https://github.com/pedroslopez/whatsapp-web.js
- Supabase Docs: https://supabase.com/docs

---

**Last Updated:** 2026-02-09
**Railway Configuration:** Nixpacks + Node.js 18+
**Status:** Production Ready ✅
