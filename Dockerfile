FROM node:22-slim

# ---------------------------------------------------------------------------
# System dependencies
#   chromium          → whatsapp-web.js (Puppeteer)
#   python3 / venv    → tiktok-uploader Python script
#   ffmpeg            → slideshow video creation (createSlideshowVideo.js)
# ---------------------------------------------------------------------------
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    python3 \
    python3-pip \
    python3-venv \
    ffmpeg \
    ca-certificates \
    wget \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Puppeteer: skip bundled download, use system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# ---------------------------------------------------------------------------
# Node.js dependencies
# ---------------------------------------------------------------------------
COPY package*.json ./
RUN npm ci --only=production

# ---------------------------------------------------------------------------
# Application code
# ---------------------------------------------------------------------------
COPY . .

# ---------------------------------------------------------------------------
# Python venv — tiktok-uploader + Playwright Chrome
# Playwright downloads Chrome (~350 MB) into /root/.cache/ms-playwright/
# --with-deps installs any missing system libraries automatically
# ---------------------------------------------------------------------------
RUN python3 -m venv src/scripts/.venv \
    && src/scripts/.venv/bin/pip install --upgrade pip --quiet \
    && src/scripts/.venv/bin/pip install tiktok-uploader --quiet \
    && src/scripts/.venv/bin/playwright install --with-deps chrome

ENV NODE_ENV=production

CMD ["npm", "start"]
