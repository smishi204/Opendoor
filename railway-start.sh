#!/bin/bash

# Railway startup script - Ensures web interface is primary service
echo "🚂 Railway deployment detected - Starting Opendoor MCP Server"

# Set Railway-specific environment variables
export NODE_ENV=production
export WEB_INTERFACE=true
export MCP_TRANSPORT=sse

# Ensure PORT is set (Railway provides this)
if [ -z "$PORT" ]; then
    export PORT=3000
    echo "⚠️  PORT not set by Railway, defaulting to 3000"
else
    echo "✅ Railway PORT detected: $PORT"
fi

# Start the web interface directly (bypassing supervisord for Railway)
echo "🌐 Starting web interface on port $PORT..."
npm start

# Note: Redis will be started by supervisord if needed, but web interface is primary