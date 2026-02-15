#!/bin/bash

# Startup script for WhatsApp bot with Node v20
# This ensures TensorFlow.js works correctly

echo "🚀 Starting WhatsApp bot with Node.js v20..."
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

# Use Node v20
nvm use 20

# Verify version
echo "Node version: $(node --version)"
echo

# Start the bot
npm start
