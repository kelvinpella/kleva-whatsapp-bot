# Hostinger VPS — Deployment Guide

## Prerequisites

- Hostinger VPS (Ubuntu 22.04 recommended)
- SSH access to the server
- Docker + Docker Compose installed on the server
- TikTok `cookies.txt` ready (export from browser using a Netscape cookie extension)

---

## 1. Install Docker on the VPS

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

---

## 2. Clone the Repo

```bash
git clone https://github.com/kelvinpella/kleva-whatsapp-bot.git
cd kleva-whatsapp-bot
```

---

## 3. Create `.env`

Copy the template below and fill in real values:

```env
# App
YOUR_PHONE_NUMBER=+255XXXXXXXXXX
CLEANUP_DAYS=30

# Image matching
MIN_SIMILARITY=0.70
SEMANTIC_WEIGHT=0.60
TEXTURE_WEIGHT=0.25
COLOR_WEIGHT=0.15

# Image validation
HANDBAG_CONFIDENCE_THRESHOLD=0.5
MAX_IMAGES_PER_MESSAGE=2
MAX_IMAGE_SIZE_KB=5000

# Supabase
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_KEY=your_supabase_anon_key
SUPABASE_STORAGE_BUCKET=handbags

# WhatsApp groups to monitor (GroupName:GroupID)
ALLOWED_GROUPS=Kleva Pochi Kali:120363424482974321@g.us

# TikTok — path is relative to project root, mounted as a volume
TIKTOK_COOKIES_PATH=cookies.txt

# WhatsApp number to notify after each TikTok post (no + prefix, with @c.us)
NOTIFICATION_NUMBER=255XXXXXXXXX@c.us
```

> `NODE_ENV` and `REDIS_URL` are set automatically by docker-compose — do not add them.

---

## 4. Add TikTok Cookies

Export your TikTok session cookies in **Netscape format** (use the
"Get cookies.txt LOCALLY" Chrome/Firefox extension on tiktok.com while logged in),
then copy the file to the server:

```bash
scp cookies.txt user@your-server-ip:~/kleva-whatsapp-bot/
```

The file must be named `cookies.txt` and sit next to `docker-compose.yml`.
When cookies expire, replace the file and run `docker compose restart app`.

---

## 5. Build & Start

```bash
docker compose up -d --build
```

First build downloads Playwright Chrome (~350 MB) and installs all deps — it takes a few minutes.

---

## 6. Authenticate WhatsApp

```bash
docker compose logs -f app
```

Wait for the QR code to appear in the logs, then scan it from WhatsApp on your phone:
**Settings → Linked Devices → Link a Device**

Once you see `✓ Client is ready and session is persisted!` the bot is live.
The session is stored in a Docker volume and survives restarts — you only scan once.

---

## Useful Commands

```bash
# View live logs
docker compose logs -f app

# Restart the bot (e.g. after updating cookies.txt)
docker compose restart app

# Pull latest code and redeploy
git pull && docker compose up -d --build

# Stop everything
docker compose down

# Stop and wipe all data (including WhatsApp session — forces re-scan)
docker compose down -v
```

---

## How Persistence Works

| Data | Where it lives |
|---|---|
| WhatsApp session | `whatsapp_session` Docker volume → `/app/.wwebjs_auth/` |
| BullMQ job queues | `redis_data` Docker volume |
| TikTok cookies | `./cookies.txt` bind-mounted read-only into the container |

`docker compose down` keeps the volumes intact.
`docker compose down -v` deletes them (forces new QR scan on next start).

---

## Quick Fixes

**QR code not showing?**
→ `docker compose logs app` — look for Puppeteer/Chromium errors

**Bot disconnects after scan?**
→ Make sure the phone has internet; check Linked Devices on phone

**TikTok upload fails — "No valid authentication"?**
→ Cookies have expired; export fresh `cookies.txt`, copy to server, then `docker compose restart app`

**Redis connection refused?**
→ `docker compose ps` — confirm the redis service is healthy before app starts
