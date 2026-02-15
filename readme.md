# WhatsApp to TikTok Auto-Publisher

A fully automated WhatsApp bot that monitors supplier groups, processes media (videos & images), and automatically publishes to TikTok via Publer API.

## 🎯 Project Goal

Enable handbag suppliers to:
- Automatically monitor WhatsApp supplier groups for new product media
- Process and batch media messages (album detection)
- Auto-publish videos and images to TikTok with smart hashtag processing
- Track supplier sources with automated hashtag codes
- Maintain brand consistency with randomized content templates

## ✨ Core Features

- **🔍 Automatic Group Monitoring** — Monitors WhatsApp supplier groups 24/7
- **📦 Album Detection** — Batches media sent within 2-second window
- **⚡ Queue-Based Processing** — BullMQ with Redis for scalable message handling
- **📤 Direct Publer Upload** — Upload media directly to Publer (no intermediary storage)
- **🎬 TikTok Auto-Publishing** — Videos as individual posts, images as carousels
- **🏷️ Smart Hashtag Processing** — Limit to 4 hashtags + auto-generated supplier code
- **📱 Session Persistence** — No QR code rescan on restart
- **🔄 Dev/Prod Filtering** — Test with `/bottest` in development, auto-filter in production
- **🎨 Content Templates** — Randomized Swahili marketing descriptions

## 🚀 Quick Start

**Prerequisites:** Node.js v18+, npm v9+

1. **Clone and install:**
   ```bash
   git clone https://github.com/kelvinpella/kleva-whatsapp-bot.git
   cd kleva-whatsapp-bot
   npm install
   ```

2. **Configure:**
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

3. **Start:**
   ```bash
   npm run dev          # Development (auto-reload)
   npm start            # Production
   ```

4. **Scan QR code** when prompted with your WhatsApp phone

## 📖 How It Works

1. **Monitor** — Bot monitors allowed WhatsApp supplier groups
2. **Detect** — Album detection batches media sent within 2 seconds
3. **Queue** — Messages queued via BullMQ for scalable processing
4. **Download** — Media downloaded from WhatsApp messages
5. **Upload** — Direct upload to Publer (videos with original audio, images)
6. **Process** — Hashtag processing (limit to 4 + supplier code generation)
7. **Publish** — Auto-publish to TikTok:
   - **Videos**: Individual posts with 1.5-minute delays
   - **Images**: Single carousel post with all images
8. **Track** — Supplier code hashtag for tracking (e.g., `#KLEHK1502`)

Example TikTok Post:
```
Pochi kali sana! 💼✨
#fashion #bags #handbags #trending #KLEHK1502

Supplier: Kleva Pochi Kali
Date: Feb 15, 2026
```

## 🛠️ Tech Stack

- **WhatsApp:** whatsapp-web.js + Puppeteer
- **Queue:** BullMQ + Redis (message processing)
- **Publishing:** Publer API (TikTok integration)
- **Media:** FFmpeg (video processing), FormData (multipart uploads)
- **Content:** JSON templates (randomized descriptions)
- **Development:** nodemon (hot reload), environment-based filtering

## 📊 Performance Targets

- Album detection: 2-second window
- Media processing: < 10 seconds per message
- Upload to Publer: < 5 seconds per file
- TikTok publishing: 1.5-minute delays between posts
- Queue processing: Sequential with retry logic
- Memory: < 512MB
- Uptime: 99%+

## 🏗️ Project Structure

```
src/
├── bot.js                    # WhatsApp client
├── config.js                 # Config loader
├── handlers/                 # Message, search, group handling
└── utils/                    # Image processing, text parsing
```

See [EXECUTION_PLAN.md](EXECUTION_PLAN.md) for full roadmap.

## 📝 Configuration

Edit `.env`:

```env
# Environment
NODE_ENV=development  # or 'production'

# WhatsApp
YOUR_PHONE_NUMBER=+255700000000
ALLOWED_GROUPS=GroupName:120363424482974321@g.us

# Publer API
PUBLER_API_KEY=your_api_key_here
PUBLER_WORKSPACE_ID=your_workspace_id
TIKTOK_ACCOUNT_ID=your_tiktok_account_id

# Redis (optional, defaults to localhost)
REDIS_HOST=localhost
REDIS_PORT=6379
```

**Development vs Production:**
- **Development**: Only processes messages with `/bottest` marker
- **Production**: Processes all messages except `/bottest`

## 🐛 Troubleshooting

**Browser lock issue:**
```bash
pkill -f ".wwebjs_auth/session"
npm run dev
```

## 🚀 Deployment

- **Railway.app** — Easiest, free tier
- **Render.com** — Free tier available  
- **VPS** — Full control, $5-10/month

See [SETUP.md](SETUP.md) for details.

## 📄 License

MIT License

## 🤝 Support

Check [SETUP.md](SETUP.md) and [EXECUTION_PLAN.md](EXECUTION_PLAN.md) for guides.