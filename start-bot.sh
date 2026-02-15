#!/bin/bash

# Startup script for WhatsApp bot with Node v24 (latest LTS)
# Ensures compatibility with all dependencies

echo "🚀 Starting WhatsApp bot with Node.js v24 LTS..."
echo

# Start Redis server
echo "📦 Starting Redis server..."
if command -v redis-server &> /dev/null; then
    redis-server --daemonize yes
    echo "✅ Redis server started"
else
    echo "⚠️  Redis not found. Please install Redis first."
    exit 1
fi
echo

# Load nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Use Node v24 (latest LTS)
nvm use 24

# Verify version
echo "Node version: $(node --version)"
echo

# Start the bot
npm start
