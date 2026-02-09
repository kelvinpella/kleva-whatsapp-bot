# Railway Quick Start

Fast deployment guide - 10 minutes from code to production.

## Prerequisites ✅

- [x] GitHub account
- [x] Railway account (https://railway.app)
- [x] Code pushed to GitHub
- [x] Supabase project ready

---

## 🚀 5-Step Deployment

### 1. Push Code to GitHub

```bash
git add .
git commit -m "chore: prepare for Railway deployment"
git push origin main
```

### 2. Create Railway Project

1. Go to https://railway.app
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Choose **`kelvinpella/kleva-whatsapp-bot`**

### 3. Add Environment Variables

Go to your Railway project → **Variables** tab → Add:

```env
NODE_ENV=production
YOUR_PHONE_NUMBER=+255XXXXXXXXXX
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_KEY=your_supabase_anon_key
SUPABASE_STORAGE_BUCKET=handbags
MIN_SIMILARITY=0.4
CLEANUP_DAYS=30
HANDBAG_CONFIDENCE_THRESHOLD=0.5
MAX_IMAGES_PER_MESSAGE=2
MAX_IMAGE_SIZE_KB=5000
```

**⚠️ Replace `SUPABASE_KEY` with your actual key from Supabase dashboard**

### 4. Deploy & Wait

Railway automatically builds and deploys. Wait 2-3 minutes for:
- Build to complete
- Service to start
- Logs to show QR code

### 5. Authenticate WhatsApp

1. Railway dashboard → **Deployments** → Click latest deployment
2. View **logs** and find QR code (ASCII art)
3. Open WhatsApp on phone → **Settings** → **Linked Devices**
4. Tap **"Link a Device"** → Scan QR code from logs
5. Wait for: `✓ Client is ready and session is persisted!`

---

## ✅ Verify Deployment

### Test 1: Image Indexing
- Post handbag image in supplier group
- Check Railway logs for: `✅ Saved image to database`

### Test 2: Image Search
- Send handbag image + `/search` to bot WhatsApp
- Wait for response with supplier info

---

## 📊 Monitor

- **Logs:** Railway dashboard → Deployments → View logs
- **Restart:** Railway dashboard → Deployments → "..." → Restart
- **Usage:** Railway dashboard → Usage tab

---

## 💰 Cost

- $5 free credits/month
- ~$5-10/month after free credits
- Monitor usage in dashboard

---

## 🆘 Quick Fixes

**QR code not showing?**
→ Redeploy service, check logs for Puppeteer errors

**Bot disconnects?**
→ Check WhatsApp phone has internet, verify linked devices

**Images not saving?**
→ Verify `SUPABASE_KEY` is correct, check Supabase bucket exists

---

## 📖 Full Guide

For detailed instructions, see [DEPLOYMENT.md](./DEPLOYMENT.md)

---

**Status:** Ready to deploy ✅
