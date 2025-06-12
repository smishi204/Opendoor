# Dockerfile for Railway deployment with local execution
FROM node:22-alpine

# Install system dependencies for local execution environment
RUN apk add --no-cache \
    redis \
    supervisor \
    curl \
    wget \
    bash \
    git \
    python3 \
    python3-dev \
    py3-pip \
    py3-setuptools \
    py3-wheel \
    gcc \
    g++ \
    make \
    musl-dev \
    linux-headers \
    openjdk17-jdk \
    go \
    ca-certificates \
    tzdata \
    procps \
    htop \
    && rm -rf /var/cache/apk/*

# Install additional programming languages
RUN echo "http://dl-cdn.alpinelinux.org/alpine/edge/community" >> /etc/apk/repositories \
    && apk update \
    && apk add --no-cache \
    swift \
    perl \
    perl-dev \
    perl-app-cpanminus \
    lua5.4 \
    lua5.4-dev \
    luarocks5.4 \
    ruby \
    ruby-dev \
    ruby-bundler \
    php82 \
    php82-cli \
    php82-json \
    php82-phar \
    composer \
    rust \
    cargo \
    dotnet8-sdk \
    && ln -sf /usr/bin/lua5.4 /usr/bin/lua \
    && ln -sf /usr/bin/luarocks5.4 /usr/bin/luarocks

# Install Python packages for code execution capabilities
RUN pip3 install --no-cache-dir --break-system-packages \
    numpy \
    pandas \
    matplotlib \
    seaborn \
    scipy \
    scikit-learn \
    requests \
    httpx \
    aiohttp \
    fastapi \
    flask \
    beautifulsoup4 \
    lxml \
    openpyxl \
    jupyter \
    ipython \
    pytest \
    asyncio \
    aiofiles \
    pydantic \
    psycopg2-binary \
    pymongo \
    redis \
    pillow

# Create app directory structure
WORKDIR /app
RUN mkdir -p \
    /app/sessions \
    /app/venvs \
    /app/logs \
    /var/log/supervisor \
    /var/log/mcp \
    /etc/redis \
    /var/run/redis \
    /var/lib/redis

# Copy and install dependencies - KEEP IT SIMPLE
COPY mcp-server/package*.json ./
RUN npm install

# Copy source code
COPY mcp-server/ .

# Build the application
RUN npm run build

# Create Redis configuration - bind to localhost only so Railway doesn't detect it
RUN echo "bind 127.0.0.1" > /etc/redis/redis.conf && \
    echo "port 6379" >> /etc/redis/redis.conf && \
    echo "daemonize no" >> /etc/redis/redis.conf && \
    echo "protected-mode yes" >> /etc/redis/redis.conf && \
    echo "logfile /var/log/redis/redis.log" >> /etc/redis/redis.conf && \
    echo "dir /var/lib/redis" >> /etc/redis/redis.conf

# Create supervisord config - START WEB INTERFACE FIRST so Railway detects it
RUN echo '[supervisord]' > /etc/supervisord.conf && \
    echo 'nodaemon=true' >> /etc/supervisord.conf && \
    echo 'user=root' >> /etc/supervisord.conf && \
    echo 'logfile=/var/log/supervisor/supervisord.log' >> /etc/supervisord.conf && \
    echo '[program:mcp-server]' >> /etc/supervisord.conf && \
    echo 'command=node dist/index.js' >> /etc/supervisord.conf && \
    echo 'directory=/app' >> /etc/supervisord.conf && \
    echo 'autostart=true' >> /etc/supervisord.conf && \
    echo 'autorestart=true' >> /etc/supervisord.conf && \
    echo 'priority=100' >> /etc/supervisord.conf && \
    echo 'stderr_logfile=/var/log/supervisor/mcp-server.err.log' >> /etc/supervisord.conf && \
    echo 'stdout_logfile=/var/log/supervisor/mcp-server.out.log' >> /etc/supervisord.conf && \
    echo 'environment=PORT=%(ENV_PORT)s,NODE_ENV=production,WEB_INTERFACE=true,REDIS_URL=redis://localhost:6379,MCP_TRANSPORT=sse' >> /etc/supervisord.conf && \
    echo '[program:redis]' >> /etc/supervisord.conf && \
    echo 'command=redis-server /etc/redis/redis.conf' >> /etc/supervisord.conf && \
    echo 'autostart=true' >> /etc/supervisord.conf && \
    echo 'autorestart=true' >> /etc/supervisord.conf && \
    echo 'priority=200' >> /etc/supervisord.conf && \
    echo 'stderr_logfile=/var/log/supervisor/redis.err.log' >> /etc/supervisord.conf && \
    echo 'stdout_logfile=/var/log/supervisor/redis.out.log' >> /etc/supervisord.conf

# Create startup script
RUN echo '#!/bin/bash' > /start.sh && \
    echo 'export PORT=${PORT:-3000}' >> /start.sh && \
    echo 'export NODE_ENV=production' >> /start.sh && \
    echo 'export WEB_INTERFACE=true' >> /start.sh && \
    echo 'export MCP_TRANSPORT=sse' >> /start.sh && \
    echo 'export REDIS_URL=redis://localhost:6379' >> /start.sh && \
    echo 'echo "🚀 Starting Opendoor on port $PORT"' >> /start.sh && \
    echo 'echo "🌐 Web interface: WEB_INTERFACE=$WEB_INTERFACE"' >> /start.sh && \
    echo 'echo "🔧 Environment: NODE_ENV=$NODE_ENV"' >> /start.sh && \
    echo 'sed -i "s/%(ENV_PORT)s/$PORT/g" /etc/supervisord.conf' >> /start.sh && \
    echo 'exec supervisord -c /etc/supervisord.conf' >> /start.sh && \
    chmod +x /start.sh

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:${PORT:-3000}/health || exit 1

# Environment variables for local execution
ENV NODE_ENV=production \
    WEB_INTERFACE=true \
    MCP_TRANSPORT=sse \
    HOST=0.0.0.0 \
    REDIS_URL=redis://localhost:6379 \
    PYTHONPATH=/usr/lib/python3.11/site-packages \
    PATH=/usr/local/bin:/usr/bin:/bin:/app/node_modules/.bin \
    JAVA_HOME=/usr/lib/jvm/java-17-openjdk \
    GOPATH=/usr/local/go

EXPOSE 3000

CMD ["/start.sh"]