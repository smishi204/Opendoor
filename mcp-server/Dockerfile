# Multi-stage build for production-ready MCP server
FROM node:22-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies needed for building)
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:22-alpine AS production

# Install system dependencies for Docker-in-Docker and Redis
RUN apk add --no-cache \
    docker \
    docker-compose \
    redis \
    supervisor \
    curl \
    bash

# Create app user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy built application from builder stage
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./

# Copy configuration files
COPY --chown=nodejs:nodejs docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY --chown=nodejs:nodejs docker/redis.conf /etc/redis/redis.conf
COPY --chown=nodejs:nodejs docker/entrypoint.sh /entrypoint.sh

# Make entrypoint executable
RUN chmod +x /entrypoint.sh

# Create necessary directories
RUN mkdir -p /var/log/supervisor /var/run/redis /var/lib/redis && \
    chown -R nodejs:nodejs /var/log/supervisor /var/run/redis /var/lib/redis

# Expose ports
EXPOSE 3000 6379

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Set environment variables
ENV NODE_ENV=production
ENV REDIS_URL=redis://localhost:6379
ENV MCP_TRANSPORT=sse
ENV HOST=0.0.0.0
ENV PORT=3000

# Switch to non-root user
USER nodejs

# Start the application
ENTRYPOINT ["/entrypoint.sh"]
CMD ["supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]