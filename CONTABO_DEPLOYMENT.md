# Contabo Deployment Guide

Step-by-step setup for running the Kleva WhatsApp bot on a **Contabo VPS** with
Docker Compose and **automatic redeploys on every push to `main`**.

> Need Docker commands while operating the server? See the
> **[Docker cheatsheet →](DOCKER_COMMANDS.md)**

## How it fits together

```
 You push to main  ─►  GitHub Actions  ──SSH──►  Contabo VPS
                       (deploy.yml)               │
                                                  ├─ docker compose
                                                  │   ├─ bot    (Node + Chromium + workers)
                                                  │   └─ redis  (queue + WhatsApp session)
                                                  └─ volumes (persist across redeploys)
```

- The bot talks to Redis at `redis://redis:6379` (set automatically by Compose).
- The WhatsApp login is stored in Redis (`RemoteAuth`), so you scan the QR **once** —
  it survives restarts and redeploys as long as the `redis-data` volume exists.

There are **three phases**. Do them in order.

---

# Phase 0 — Land the code on `main`

Auto-deploy only triggers from `main`, and the server bootstrap pulls a script from
`main`, so this has to happen first.

**Step 0.1** — From your local machine, commit and push the deployment files, then
merge them into `main` (via PR or directly).

```bash
git add -A
git commit -m "feat: Contabo Docker deploy + auto-deploy"
git push
# open a PR and merge into main
```

✅ **Checkpoint:** `docker-compose.yml`, `.github/workflows/deploy.yml`, and
`scripts/bootstrap-server.sh` are visible on GitHub's `main` branch.

---

# Phase 1 — Set up the Contabo server (one time)

### Step 1.1 — Create the VPS

In the Contabo panel, create a **Cloud VPS**:

- **OS:** Ubuntu 22.04 or 24.04
- **RAM:** ≥ 2 GB (4 GB recommended — Chromium is memory-hungry)

Write down the server's **IP address** and the **root password** Contabo emails you.

### Step 1.2 — Log in as root

From your local terminal:

```bash
ssh root@YOUR_SERVER_IP
```

(Accept the fingerprint prompt, enter the root password.)

### Step 1.3 — Create a non-root deploy user

Running the app as a dedicated user (not root) is safer. As root:

```bash
adduser deploy                 # set a password when prompted
usermod -aG sudo deploy        # give it sudo rights
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy   # copy your SSH access
```

Then switch to that user:

```bash
su - deploy
```

✅ **Checkpoint:** your shell prompt now shows `deploy@...`.

### Step 1.4 — Run the bootstrap script

This installs Docker + the Compose plugin, clones the repo to
`~/kleva-whatsapp-bot`, and creates a starter `.env`:

```bash
curl -fsSL https://raw.githubusercontent.com/kelvinpella/kleva-whatsapp-bot/main/scripts/bootstrap-server.sh | bash
```

> If Docker was just installed for the first time, **log out and back in**
> (`exit`, then `ssh`/`su - deploy` again) so your user joins the `docker` group.
> Quick test: `docker ps` should run without `sudo`.

✅ **Checkpoint:** `ls ~/kleva-whatsapp-bot` shows the project files.

### Step 1.5 — Fill in your secrets

```bash
cd ~/kleva-whatsapp-bot
nano .env
```

Set the real values: `YOUR_PHONE_NUMBER`, `ALLOWED_GROUPS`, `NOTIFICATION_NUMBER`,
`SUPABASE_*`, `CLOUDINARY_*`, `ZERNIO_*`. Save with `Ctrl+O`, `Enter`, then exit
with `Ctrl+X`.

> Leave out `NODE_ENV`, `REDIS_URL`, and `PUPPETEER_EXECUTABLE_PATH` — Compose sets
> those for you.

### Step 1.6 — Build and start

```bash
docker compose up -d --build
```

First build takes a few minutes (it installs Chromium). Check both containers are up:

```bash
docker compose ps
```

✅ **Checkpoint:** `kleva-bot` and `kleva-redis` both show as running.

### Step 1.7 — Link WhatsApp (scan the QR once)

```bash
docker compose logs -f bot
```

A QR code prints in the logs. On your phone: **WhatsApp → Settings → Linked
Devices → Link a Device**, and scan it. Wait for `Client is ready`. Press
`Ctrl+C` to stop tailing the logs (the bot keeps running).

✅ **Checkpoint:** logs show `Client is ready` and the bot reacts to messages in
your allowed groups. **The bot is now live.**

---

# Phase 2 — Turn on auto-deploy

Now wire up GitHub so pushes to `main` redeploy automatically.

### Step 2.1 — Create a dedicated deploy key (on your local machine)

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/kleva_deploy -N ""
```

This makes two files: `~/.ssh/kleva_deploy` (private) and `~/.ssh/kleva_deploy.pub`
(public).

### Step 2.2 — Authorize the key on the server

```bash
ssh-copy-id -i ~/.ssh/kleva_deploy.pub deploy@YOUR_SERVER_IP
# verify:
ssh -i ~/.ssh/kleva_deploy deploy@YOUR_SERVER_IP "echo ok"
```

✅ **Checkpoint:** the verify command prints `ok` without asking for a password.

### Step 2.3 — Add the GitHub secrets

In GitHub: **Repo → Settings → Secrets and variables → Actions → New repository
secret**. Add all five:

| Secret | Value |
|--------|-------|
| `CONTABO_HOST` | Your server IP |
| `CONTABO_USER` | `deploy` |
| `CONTABO_SSH_KEY` | The **entire** private key file `~/.ssh/kleva_deploy` |
| `CONTABO_PORT` | `22` |
| `CONTABO_APP_DIR` | `/home/deploy/kleva-whatsapp-bot` |

> Copy the private key on macOS with: `cat ~/.ssh/kleva_deploy | pbcopy`

### Step 2.4 — Test it

Push any change to `main`, or trigger manually: **GitHub → Actions → Deploy to
Contabo → Run workflow**. Watch the run under the **Actions** tab.

✅ **Checkpoint:** the workflow finishes green and prints the deployed commit hash.

🎉 **Done.** Every push to `main` now redeploys automatically. You won't rescan the
QR — the session persists in Redis.

---

# Day-to-day operations

Run these from `~/kleva-whatsapp-bot` on the server. Full list in the
**[Docker cheatsheet →](DOCKER_COMMANDS.md)**.

```bash
docker compose logs -f bot     # watch bot logs live (and the QR on first login)
docker compose ps              # are the containers up?
docker compose restart bot     # restart just the bot
docker compose up -d --build   # manual redeploy after pulling code
docker compose down            # stop everything (volumes/data are kept)
```

### Re-link WhatsApp from scratch (new QR)

Only if the session is broken:

```bash
docker compose down
docker volume ls                                   # find the exact volume names
docker volume rm kleva-whatsapp-bot_redis-data kleva-whatsapp-bot_wwebjs-auth
docker compose up -d --build && docker compose logs -f bot
```

---

# Troubleshooting

| Symptom | Fix |
|---------|-----|
| QR never appears / Chromium keeps crashing | VPS likely low on RAM — use ≥ 2 GB. The bot already runs Chromium with `--no-sandbox --single-process`. |
| Bot can't reach Redis | `docker compose ps` — `kleva-redis` should be healthy; the bot waits for it before starting. |
| `docker: permission denied` | Deploy user isn't in the `docker` group yet — log out/in, or run `newgrp docker`. |
| GitHub Actions deploy fails | Open the failed run under **Actions**; the SSH step prints the failing command. Recheck the 5 secrets and that the deploy key can `ssh` in. |
| Changes pushed but nothing deployed | Confirm you pushed to `main` (the workflow only runs on `main`) and the workflow file exists there. |
