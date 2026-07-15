#!/bin/bash

# Startup script for WhatsApp bot with Node v24 (latest LTS)
# Ensures compatibility with all dependencies

echo "🚀 Starting WhatsApp bot with Node.js v24 LTS..."
echo

# Start Redis server only if it isn't already running
echo "📦 Checking Redis server..."
if command -v redis-server &> /dev/null; then
    if redis-cli ping &> /dev/null; then
        echo "✅ Redis server is already running"
    else
        redis-server --daemonize yes
        echo "✅ Redis server started"
    fi
else
    echo "⚠️  Redis not found. Please install Redis first."
    exit 1
fi
echo

# Load nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Use Node v24 (latest LTS) if available; otherwise fall back to the system node
if command -v nvm &> /dev/null && nvm use 24 &> /dev/null; then
    echo "Using Node v24 via nvm"
fi

# Verify version
echo "Node version: $(node --version)"
echo

# Start the bot with exec so the Node process replaces this shell.
# This prevents orphaned bot processes when the terminal window is closed.
exec node .
