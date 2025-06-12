#!/bin/bash

# Production startup script for Opendoor MCP Server
echo "🚀 Starting Opendoor MCP Server..."

# Check if this is a Railway deployment
if [ -n "$RAILWAY_ENVIRONMENT" ] || [ -n "$RAILWAY_PROJECT_ID" ] || [ -n "$RAILWAY_SERVICE_ID" ] || ([ -n "$PORT" ] && [ "$NODE_ENV" = "production" ]); then
    echo "🚂 Railway deployment detected"
    echo "🌐 Starting web interface only (Redis disabled for Railway)"
    
    # Set Railway-specific environment variables
    export WEB_INTERFACE=true
    export MCP_TRANSPORT=sse
    export NODE_ENV=production
    
    # Start web interface directly without Redis
    cd /app && npm start
    
else
    echo "🐳 Docker deployment detected"
    echo "🔧 Starting full stack with Redis and web interface"
    
    # Start supervisord for full Docker deployment
    exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
fi