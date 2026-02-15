# Railway Deployment Guide

Complete guide to deploying the WhatsApp to TikTok Auto-Publisher Bot to Railway.app

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

# WhatsApp Configuration
YOUR_PHONE_NUMBER=+255XXXXXXXXXX
ALLOWED_GROUPS=Kleva Pochi Kali:120363424482974321@g.us,Supplier2:120363123456789012@g.us

# Publer API Configuration (Required for TikTok Publishing)
PUBLER_API_KEY=your_publer_api_key_here
PUBLER_WORKSPACE_ID=your_workspace_id
TIKTOK_ACCOUNT_ID=your_tiktok_account_id

# Redis Configuration (BullMQ Queue)
REDIS_HOST=redis.railway.internal  # Or use Railway Redis service
REDIS_PORT=6379
```

**⚠️ Important:**
- Get Publer API key from: https://app.publer.com/settings/api
- Connect TikTok account in Publer workspace first
- Get TikTok Account ID from Publer API or dashboard
- Railway provides Redis as a service - add it to your project

### 3.2 Optional: Media Processing Limits

```env
MAX_VIDEOS=2
MAX_IMAGES=10
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

### 7.1 Test in Development Mode

1. Set `NODE_ENV=development` in Railway variables
2. Send media with `/bottest` in message body to allowed groups
3. Check Railway logs for processing:
   ```
   🧪 [DEV MODE] Processing test message with /bottest
   📸 Message contains media, adding to album batch...
   📦 Processing album with X message(s)
   📤 Uploading to Publer...
   🚀 Publishing to TikTok...
   ```

### 7.2 Test TikTok Publishing (Production)

1. Set `NODE_ENV=production` in Railway variables
2. Post handbag videos/images in allowed WhatsApp groups (without `/bottest`)
3. Check Railway logs for:
   ```
   📹 Video Publer IDs: [id1, id2]
   📸 Image Publer IDs: [id1, id2, ...]
   📹 Publishing 2 video(s) to TikTok...
   ✅ Video 1/2 published successfully
   🖼️ Publishing 5 image(s) as carousel to TikTok...
   ✅ Carousel published successfully
   ```
4. Verify posts on TikTok with supplier code hashtag (e.g., `#KLEHK1502`)

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

### Issue: Media not uploading to Publer

**Solution:**
- Verify `PUBLER_API_KEY` is correct in Railway variables
- Check `PUBLER_WORKSPACE_ID` and `TIKTOK_ACCOUNT_ID` are set
- Verify TikTok account is connected in Publer workspace
- Check Railway logs for specific Publer API error messages
- Verify Publer API rate limits (100 requests/2 minutes)

### Issue: TikTok posts failing

**Solution:**
- Check Publer media IDs are valid
- Verify TikTok account authorization in Publer
- Check content templates have valid descriptions
- Verify hashtag generation is working correctly
- Review Publer dashboard for failed jobs

### Issue: Redis connection errors

**Solution:**
- Add Redis service to Railway project
- Update `REDIS_HOST` to Railway internal hostname
- Verify Redis port is 6379
- Check Railway service linking

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | Yes | `development` | `development` or `production` |
| `YOUR_PHONE_NUMBER` | Yes | - | WhatsApp number (international format) |
| `ALLOWED_GROUPS` | Yes | - | Comma-separated `Name:ID` pairs |
| `PUBLER_API_KEY` | Yes | - | Publer API authentication key |
| `PUBLER_WORKSPACE_ID` | Yes | - | Publer workspace identifier |
| `TIKTOK_ACCOUNT_ID` | Yes | - | Connected TikTok account ID in Publer |
| `REDIS_HOST` | No | `localhost` | Redis server host |
| `REDIS_PORT` | No | `6379` | Redis server port |
| `MAX_VIDEOS` | No | `2` | Max videos per album |
| `MAX_IMAGES` | No | `10` | Max images per album |

### Environment Behavior

**Development Mode** (`NODE_ENV=development`):
- Only processes messages containing `/bottest`
- Safe for testing without publishing to production TikTok
- Clear console logs with `[DEV MODE]` prefix

**Production Mode** (`NODE_ENV=production`):
- Processes all messages EXCEPT those with `/bottest`
- Automatically publishes to TikTok
- Filters out test messages

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

**Publer Pricing:**
- Free tier: Limited posts per month
- Professional: $10-21/month (recommended)
- Business: $42+/month for multiple accounts
- Check: https://publer.com/pricing

**Redis (Railway Add-on):**
- Free tier: Included in Railway usage
- Minimal memory usage for BullMQ queue
- Estimated: ~10MB storage for job data

---

## Next Steps

After successful deployment:

1. ✅ Monitor logs for 24 hours to ensure stability
2. ✅ Test with real supplier media (videos & images)
3. ✅ Verify TikTok posts are publishing correctly
4. ✅ Check supplier code hashtags are generating properly
5. ✅ Monitor Publer API rate limits and usage
6. ✅ Set up content template rotation
7. ✅ Configure monitoring/alerts for failed posts

---

## Support

- Railway Docs: https://docs.railway.app
- Railway Discord: https://discord.gg/railway
- WhatsApp Web.js: https://github.com/pedroslopez/whatsapp-web.js
- Supabase Docs: https://supabase.com/docs

---

**Last Updated:** 2026-02-15
**Railway Configuration:** Nixpacks + Node.js 18+ + Redis
**Status:** TikTok Auto-Publisher Production Ready ✅
**Features:** WhatsApp → BullMQ → Publer → TikTok
