# Contabo VPS — Deployment Guide

---

## Step 1 — Order & Provision the VPS

1. Go to **contabo.com → Cloud VPS** and order a plan (4 GB RAM minimum recommended)
2. During checkout, under **"Operating System"** select **Ubuntu 22.04**
3. Set a strong root password (you'll use this to SSH in)
4. Complete the order — Contabo sends a confirmation email with your **server IP** and credentials within a few minutes

---

## Step 2 — SSH Into the Server

Use the IP address and root password from the confirmation email:

```bash
ssh root@<your-server-ip>
```

> **Contabo panel** (`my.contabo.com` → **Your Services → VPS**): if you need to
> reset the root password, click the **⋮** menu next to your server → **Manage**
> → **Reset Password**. Use the **VNC Console** button as an emergency fallback
> if SSH is unreachable.

---

## Step 3 — Install Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

Verify:

```bash
docker --version
docker compose version
```

---

## Step 4 — Clone the Repo

```bash
git clone https://github.com/your-org/kleva-whatsapp-bot.git
cd kleva-whatsapp-bot
```

---

## Step 5 — Create `.env`

```bash
nano .env
```

Paste and fill in real values:

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

# TikTok — path relative to project root, mounted as a volume
TIKTOK_COOKIES_PATH=cookies.txt

# WhatsApp number to notify after each TikTok post (no + prefix, with @c.us)
NOTIFICATION_NUMBER=255XXXXXXXXX@c.us
```

> `NODE_ENV` and `REDIS_URL` are set automatically by docker-compose — do not add them.

Save: `Ctrl+O` → `Enter` → `Ctrl+X`

---

## Step 6 — Generate TikTok Cookies from the VPS

Cookies must be generated from the VPS IP so TikTok doesn't see a geographic mismatch.
The project includes `src/scripts/gen_cookies.py` which launches a headless Chrome on the
VPS, lets you log in via Chrome DevTools from your local machine, then saves the cookies.

You need **three terminals** open at the same time:

**Terminal 1 — VPS** (run after the image is built in Step 7):
```bash
cd ~/kleva-whatsapp-bot
docker compose run --rm -p 127.0.0.1:9222:9222 app \
  src/scripts/.venv/bin/python src/scripts/gen_cookies.py > cookies.txt
```
The script prints instructions and waits. Leave this terminal open.

**Terminal 2 — local machine** (SSH tunnel, keep open):
```bash
ssh -L 9222:localhost:9222 root@<your-server-ip>
```

**Local Chrome:**
1. Open `http://localhost:9222` — you will see a list of open pages
2. Click the TikTok entry — a DevTools panel opens
3. Log into TikTok normally inside the DevTools panel
4. Go back to Terminal 1 and press **Enter**

`cookies.txt` is created on the VPS next to `docker-compose.yml`. ✓

**When cookies expire** (typically every few weeks to months), repeat:
```bash
docker compose run --rm -p 127.0.0.1:9222:9222 app \
  src/scripts/.venv/bin/python src/scripts/gen_cookies.py > cookies.txt
docker compose restart app
```

---

## Step 7 — Build & Start

```bash
docker compose up -d --build
```

The first build downloads Playwright Chrome (~350 MB) and installs all dependencies.
It takes 5–10 minutes. Subsequent builds are much faster.

---

## Step 8 — Authenticate WhatsApp

```bash
docker compose logs -f app
```

Wait for the QR code to appear, then scan it from WhatsApp on your phone:
**WhatsApp → Settings → Linked Devices → Link a Device**

Once you see `✓ Client is ready and session is persisted!` the bot is live.
The session is stored in a Docker volume — you only scan once.

> **If the QR is hard to read in the terminal**, the logs also print a URL like:
> `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=...`
> Open it in a browser to get a clean QR image to scan.

---

## Useful Commands

```bash
# View live logs
docker compose logs -f app

# Restart the bot (e.g. after replacing cookies.txt)
docker compose restart app

# Pull latest code and redeploy
git pull && docker compose up -d --build

# Stop everything (keeps session + queue data)
docker compose down

# Full reset — deletes WhatsApp session (forces new QR scan)
docker compose down -v
```

---

## How Persistence Works

| Data | Storage |
|---|---|
| WhatsApp session | `whatsapp_session` Docker volume → `/app/.wwebjs_auth/` |
| BullMQ job queues | `redis_data` Docker volume |
| TikTok cookies | `./cookies.txt` bind-mounted read-only into the container |

`docker compose down` preserves all volumes.
`docker compose down -v` wipes them (next start requires a new QR scan).

---

## Contabo Panel Reference

| Task | Navigation |
|---|---|
| Find server IP | `my.contabo.com` → Your Services → VPS → server row |
| Reset root password | ⋮ → Manage → Reset Password |
| Emergency console (no SSH) | ⋮ → Manage → VNC Console |
| Reinstall OS | ⋮ → Manage → Reinstall → choose Ubuntu 22.04 |
| Reboot server | ⋮ → Restart |

---

## Quick Fixes

**QR code not showing?**
→ `docker compose logs app` — look for Puppeteer/Chromium errors

**Bot disconnects after scan?**
→ Ensure the phone has internet; check WhatsApp → Linked Devices

**TikTok upload fails — "No valid authentication"?**
→ Cookies expired; copy fresh `cookies.txt` to server, then `docker compose restart app`

**Redis connection refused?**
→ `docker compose ps` — confirm the redis service shows as healthy
