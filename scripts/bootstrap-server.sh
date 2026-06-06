#!/usr/bin/env bash
#
# One-time Contabo VPS bootstrap for the Kleva WhatsApp bot.
# Run this ONCE on a fresh Ubuntu/Debian Contabo server as a sudo-capable user.
#
#   curl -fsSL https://raw.githubusercontent.com/kelvinpella/kleva-whatsapp-bot/main/scripts/bootstrap-server.sh | bash
#
# or copy it over and run:  bash bootstrap-server.sh
#
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/kelvinpella/kleva-whatsapp-bot.git}"
APP_DIR="${APP_DIR:-$HOME/kleva-whatsapp-bot}"

echo "==> Updating apt and installing prerequisites"
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl git

echo "==> Installing Docker Engine + Compose plugin (if missing)"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
  echo "    Docker installed. You may need to log out/in for group changes to apply."
fi

echo "==> Cloning repository into $APP_DIR"
if [ ! -d "$APP_DIR/.git" ]; then
  git clone "$REPO_URL" "$APP_DIR"
else
  echo "    Repo already present, pulling latest"
  git -C "$APP_DIR" pull --ff-only
fi

cd "$APP_DIR"

if [ ! -f .env ]; then
  echo "==> Creating .env from .env.example — EDIT THIS with real values before starting!"
  cp .env.example .env
  echo "    >>> Edit $APP_DIR/.env now, then run: docker compose up -d --build"
else
  echo "==> .env already exists, leaving it untouched"
fi

echo ""
echo "Bootstrap complete."
echo "Next:"
echo "  1. Edit $APP_DIR/.env with production values."
echo "  2. Start:   cd $APP_DIR && docker compose up -d --build"
echo "  3. Scan QR: docker compose logs -f bot   (scan the QR with WhatsApp the first time)"
