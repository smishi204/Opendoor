# Single Dockerfile for Railway deployment with DIND
FROM docker:27-dind

# Install Node.js, Python, and system dependencies
RUN apk add --no-cache \
    nodejs npm \
    python3 py3-pip \
    redis supervisor \
    curl bash git \
    && rm -rf /var/cache/apk/*

# Install Python packages for code execution
RUN pip3 install --no-cache-dir --break-system-packages \
    numpy pandas matplotlib requests flask fastapi

# Create app directory
WORKDIR /app

# Copy and install dependencies
COPY mcp-server/package*.json ./
RUN npm ci --only=production

# Copy source code
COPY mcp-server/ .
COPY containers/ ./containers/
COPY frontend/ ./frontend/

# Build the application
RUN npm run build

# Create supervisord config
RUN echo '[supervisord]' > /etc/supervisord.conf && \
    echo 'nodaemon=true' >> /etc/supervisord.conf && \
    echo '[program:dockerd]' >> /etc/supervisord.conf && \
    echo 'command=dockerd --host=unix:///var/run/docker.sock' >> /etc/supervisord.conf && \
    echo 'autostart=true' >> /etc/supervisord.conf && \
    echo 'autorestart=true' >> /etc/supervisord.conf && \
    echo '[program:redis]' >> /etc/supervisord.conf && \
    echo 'command=redis-server --bind 127.0.0.1 --port 6379 --protected-mode yes' >> /etc/supervisord.conf && \
    echo 'autostart=true' >> /etc/supervisord.conf && \
    echo 'autorestart=true' >> /etc/supervisord.conf && \
    echo '[program:mcp-server]' >> /etc/supervisord.conf && \
    echo 'command=node dist/index.js' >> /etc/supervisord.conf && \
    echo 'directory=/app' >> /etc/supervisord.conf && \
    echo 'autostart=true' >> /etc/supervisord.conf && \
    echo 'autorestart=true' >> /etc/supervisord.conf && \
    echo 'environment=PORT=%(ENV_PORT)s,NODE_ENV=production,REDIS_URL=redis://localhost:6379' >> /etc/supervisord.conf

# Create startup script with Railway detection
RUN echo '#!/bin/bash' > /start.sh && \
    echo 'export PORT=${PORT:-3000}' >> /start.sh && \
    echo '' >> /start.sh && \
    echo '# Check if this is a Railway deployment' >> /start.sh && \
    echo 'if [ -n "$RAILWAY_ENVIRONMENT" ] || [ -n "$RAILWAY_PROJECT_ID" ] || [ -n "$RAILWAY_SERVICE_ID" ]; then' >> /start.sh && \
    echo '  echo "🚂 Railway deployment detected - starting web interface directly"' >> /start.sh && \
    echo '  export NODE_ENV=production' >> /start.sh && \
    echo '  # Start web interface directly without Redis to avoid port conflicts' >> /start.sh && \
    echo '  exec node dist/index.js' >> /start.sh && \
    echo 'else' >> /start.sh && \
    echo '  echo "🐳 Docker deployment detected - using supervisord"' >> /start.sh && \
    echo '  sed -i "s/%(ENV_PORT)s/$PORT/g" /etc/supervisord.conf' >> /start.sh && \
    echo '  exec supervisord -c /etc/supervisord.conf' >> /start.sh && \
    echo 'fi' >> /start.sh && \
    chmod +x /start.sh

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:${PORT:-3000}/health || exit 1

# Environment variables
ENV NODE_ENV=production \
    MCP_TRANSPORT=sse \
    HOST=0.0.0.0 \
    REDIS_URL=redis://localhost:6379

EXPOSE $PORT

CMD ["/start.sh"]