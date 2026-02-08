# WhatsApp Handbag Image Search Bot

A fully automated WhatsApp bot that monitors supplier groups, indexes handbag images, and enables instant visual search.

## 🎯 Project Goal

Enable handbag suppliers to:
- Automatically index all handbag images posted in WhatsApp groups
- Instantly search for similar bags by image  
- Get supplier names, prices, and product information
- Respond to customer inquiries in seconds

## ✨ Core Features

- **🔍 Automatic Group Monitoring** — Monitors WhatsApp supplier groups 24/7
- **📸 Image Indexing** — Auto-downloads and indexes new handbag images
- **🎯 Visual Search** — Send an image to find similar bags instantly
- **💰 Price Extraction** — Auto-extracts prices, brands, and bag types
- **⚡ Fast Results** — Top 3-5 matches in under 5 seconds
- **📱 Session Persistence** — No QR code rescan on restart
- **🔄 Hot Reload** — Code changes auto-restart during development

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

1. Add bot to WhatsApp supplier groups
2. Bot silently monitors and indexes new handbag image posts
3. Send an image to bot to search for similar bags
4. Bot responds with top matches, suppliers, prices, and match confidence

Example response:
```
🎯 Found 3 matches:

1. Mama Rehema Bags
   💰 TZS 45,000 | Tote Bag | Michael Kors
   🎯 95% match

2. Guangzhou Suppliers
   💰 TZS 42,000 | Crossbody | Designer
   🎯 87% match
```

## 🛠️ Tech Stack

- **WhatsApp:** whatsapp-web.js + Puppeteer
- **Images:** Sharp + Perceptual hash + Color histogram
- **Database:** SQLite (better-sqlite3)
- **Scheduling:** node-cron
- **Development:** nodemon

## 📊 Performance Targets

- New image: < 5 seconds
- Search: < 3 seconds  
- Database: < 100MB per 1,000 images
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
NODE_ENV=development
YOUR_PHONE_NUMBER=+255700000000
SUPPLIER_GROUP_IDS=group1,group2,group3
CLEANUP_DAYS=30
MIN_SIMILARITY=0.7
```

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