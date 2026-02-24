#!/usr/bin/env python3
"""
Generate TikTok cookies directly from the VPS via Chrome remote debugging.

Cookies generated this way are associated with the VPS IP — no IP mismatch,
no VPN required.

Usage (on VPS, after the Docker image is built):
  docker compose run --rm -p 127.0.0.1:9222:9222 app \\
    src/scripts/.venv/bin/python src/scripts/gen_cookies.py > cookies.txt

Then from your LOCAL machine open a second terminal and keep it open:
  ssh -L 9222:localhost:9222 root@<your-server-ip>

Open Chrome locally and go to: chrome://inspect
Under "Remote Target" click "inspect" next to the TikTok tab.
Log into TikTok, then press Enter in the VPS terminal.
"""

import glob
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

PORT = 9222


def find_chrome():
    patterns = [
        '/root/.cache/ms-playwright/chrome-*/chrome-linux/chrome',
        '/root/.cache/ms-playwright/chrome*/chrome-linux/chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/google-chrome',
    ]
    for pattern in patterns:
        matches = glob.glob(pattern)
        if matches:
            return sorted(matches)[-1]
    sys.exit(
        'Chrome binary not found. '
        'Rebuild the Docker image first: docker compose up -d --build'
    )


def to_netscape(cookies):
    lines = ['# Netscape HTTP Cookie File\n']
    for c in cookies:
        domain = c.get('domain', '')
        flag   = 'TRUE' if domain.startswith('.') else 'FALSE'
        secure = 'TRUE' if c.get('secure', False) else 'FALSE'
        expiry = c.get('expires', 0) or 0
        expiry = int(expiry) if expiry > 0 else 0
        lines.append(
            '\t'.join([domain, flag, c.get('path', '/'), secure, str(expiry), c['name'], c['value']])
            + '\n'
        )
    return ''.join(lines)


# ---------------------------------------------------------------------------
# Launch Chrome in headless mode with remote debugging
# ---------------------------------------------------------------------------
chrome_bin = find_chrome()
proc = subprocess.Popen(
    [
        chrome_bin,
        f'--remote-debugging-port={PORT}',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--headless=new',
        '--user-data-dir=/tmp/tiktok-cookie-session',
        'https://www.tiktok.com/login',
    ],
    stdout=subprocess.DEVNULL,
    stderr=subprocess.DEVNULL,
)

time.sleep(3)  # Give Chrome time to start

print(
    f'\nChrome is running (headless) on port {PORT}.\n'
    f'\nFrom your LOCAL machine — open a new terminal and run:\n'
    f'  ssh -L {PORT}:localhost:{PORT} root@<your-server-ip>   (keep this open)\n'
    f'\nThen open Chrome locally and go to:\n'
    f'  chrome://inspect\n'
    f'\nUnder "Remote Target" click "inspect" next to the TikTok tab.\n'
    f'This opens a full DevTools panel — log into TikTok normally.\n',
    file=sys.stderr,
)

input('Press Enter here once you have logged in...')

# ---------------------------------------------------------------------------
# Connect via Playwright CDP and extract cookies
# ---------------------------------------------------------------------------
with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp(f'http://localhost:{PORT}')
    contexts = browser.contexts
    if not contexts:
        proc.terminate()
        sys.exit('No browser contexts found — did Chrome start correctly?')
    cookies = contexts[0].cookies()
    browser.close()  # closes the CDP connection, does not kill the external Chrome process

proc.terminate()

tiktok_cookies = [c for c in cookies if 'tiktok' in c.get('domain', '')]
if not tiktok_cookies:
    sys.exit('No TikTok cookies found — make sure you logged in successfully.')

# Write Netscape format to stdout; caller redirects to cookies.txt
print(to_netscape(tiktok_cookies), end='')
print(f'✓ Saved {len(tiktok_cookies)} TikTok cookies.', file=sys.stderr)
