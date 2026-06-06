# Docker Cheatsheet

Handy commands for operating the Kleva WhatsApp bot on the Contabo VPS.
Unless noted, run them from the project directory:

```bash
cd ~/kleva-whatsapp-bot
```

> This project uses **Docker Compose v2** — the command is `docker compose`
> (with a space), not the old `docker-compose`.

---

## Compose — start / stop / rebuild

| Command | What it does |
|---------|--------------|
| `docker compose up -d` | Start all services in the background |
| `docker compose up -d --build` | Rebuild images, then start (use after code changes) |
| `docker compose down` | Stop and remove containers (named volumes/data are **kept**) |
| `docker compose down -v` | Stop **and delete volumes** — wipes Redis + WhatsApp session ⚠️ |
| `docker compose restart` | Restart all services |
| `docker compose restart bot` | Restart only the bot |
| `docker compose stop` / `start` | Stop / start without removing containers |
| `docker compose ps` | List this project's containers and their status |
| `docker compose pull` | Pull newer base images (e.g. redis) |

## Logs

| Command | What it does |
|---------|--------------|
| `docker compose logs -f bot` | Follow the bot logs live (find the QR here) |
| `docker compose logs -f` | Follow logs for all services |
| `docker compose logs --tail=100 bot` | Last 100 lines from the bot |
| `docker compose logs --since=10m bot` | Bot logs from the last 10 minutes |

## Run commands inside a container

| Command | What it does |
|---------|--------------|
| `docker compose exec bot sh` | Open a shell inside the running bot container |
| `docker compose exec bot node -v` | Run a one-off command in the bot |
| `docker compose exec redis redis-cli` | Open the Redis CLI |
| `docker compose exec redis redis-cli ping` | Health-check Redis (expects `PONG`) |
| `docker compose exec redis redis-cli keys 'whatsapp_session:*'` | See stored WhatsApp session keys |

---

## Containers (raw docker)

| Command | What it does |
|---------|--------------|
| `docker ps` | List running containers |
| `docker ps -a` | List all containers (including stopped) |
| `docker logs -f kleva-bot` | Follow logs by container name |
| `docker stats` | Live CPU / memory usage per container |
| `docker inspect kleva-bot` | Full config/state of a container (JSON) |
| `docker restart kleva-bot` | Restart by name |

## Images

| Command | What it does |
|---------|--------------|
| `docker images` | List local images |
| `docker image prune -f` | Remove dangling (untagged) images |
| `docker build -t kleva-bot .` | Build the image manually from the Dockerfile |

## Volumes (data lives here)

| Command | What it does |
|---------|--------------|
| `docker volume ls` | List volumes (look for `kleva-whatsapp-bot_*`) |
| `docker volume inspect kleva-whatsapp-bot_redis-data` | Where/how a volume is stored |
| `docker volume rm <name>` | Delete a volume (must stop containers first) ⚠️ |

> The three volumes for this project:
> `kleva-whatsapp-bot_redis-data` (queue + WhatsApp session),
> `kleva-whatsapp-bot_wwebjs-auth`, `kleva-whatsapp-bot_wwebjs-cache`.
> Deleting `redis-data` forces a fresh QR scan on next start.

---

## Cleanup / disk space

| Command | What it does |
|---------|--------------|
| `docker system df` | Show disk used by images, containers, volumes |
| `docker system prune -f` | Remove stopped containers, unused networks, dangling images |
| `docker system prune -a --volumes` | Aggressive cleanup — removes **all** unused images **and volumes** ⚠️ |

---

## Common tasks

**Redeploy the latest code manually** (what the GitHub Action does):
```bash
cd ~/kleva-whatsapp-bot
git pull origin main
docker compose up -d --build
docker image prune -f
```

**Force a fresh WhatsApp login (new QR):**
```bash
docker compose down
docker volume rm kleva-whatsapp-bot_redis-data kleva-whatsapp-bot_wwebjs-auth
docker compose up -d --build
docker compose logs -f bot
```

**Check everything is healthy:**
```bash
docker compose ps
docker compose exec redis redis-cli ping   # -> PONG
docker compose logs --tail=50 bot
```
