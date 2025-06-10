# 🚀 Production Deployment Guide

This guide covers deploying the Opendoor MCP Server in production environments using GitHub Container Registry.

## 📦 GitHub Container Registry

The Opendoor MCP Server is automatically built and published to GitHub Container Registry (GHCR) on every push to the main branch.

### Available Images

- **Latest**: `ghcr.io/openhands-mentat-cli/opendoor/opendoor-mcp:latest`
- **Tagged**: `ghcr.io/openhands-mentat-cli/opendoor/opendoor-mcp:v1.0.0`
- **Branch**: `ghcr.io/openhands-mentat-cli/opendoor/opendoor-mcp:main`

## 🐳 Quick Start

### Single Container Deployment

```bash
# Pull the latest image
docker pull ghcr.io/openhands-mentat-cli/opendoor/opendoor-mcp:latest

# Run with SSE transport (recommended for production)
docker run -d --name opendoor-mcp \
  --restart unless-stopped \
  -p 3000:3000 \
  -p 3001:3001 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e MCP_TRANSPORT=sse \
  -e NODE_ENV=production \
  -e REDIS_URL=redis://localhost:6379 \
  ghcr.io/openhands-mentat-cli/opendoor/opendoor-mcp:latest
```

### Docker Compose Deployment

Create a `docker-compose.prod.yml` file:

```yaml
version: '3.8'

services:
  mcp-server:
    image: ghcr.io/openhands-mentat-cli/opendoor/opendoor-mcp:latest
    container_name: opendoor-mcp
    restart: unless-stopped
    ports:
      - "3000:3000"
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - MCP_TRANSPORT=sse
      - HOST=0.0.0.0
      - PORT=3000
      - REDIS_URL=redis://redis:6379
      - ALLOWED_ORIGINS=*
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    depends_on:
      - redis
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  redis:
    image: redis:7-alpine
    container_name: opendoor-redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  redis_data:
```

Deploy with:

```bash
docker-compose -f docker-compose.prod.yml up -d
```

## 🔧 Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `production` | Node.js environment |
| `MCP_TRANSPORT` | `sse` | Transport type: `sse` or `stdio` |
| `HOST` | `0.0.0.0` | Server host |
| `PORT` | `3000` | Server port |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection URL |
| `ALLOWED_ORIGINS` | `*` | CORS allowed origins |
| `LOG_LEVEL` | `info` | Logging level |

### Security Configuration

```bash
# Run with restricted permissions
docker run -d --name opendoor-mcp \
  --restart unless-stopped \
  --user 1001:1001 \
  --read-only \
  --tmpfs /tmp \
  -p 3000:3000 \
  -p 3001:3001 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e MCP_TRANSPORT=sse \
  -e NODE_ENV=production \
  ghcr.io/openhands-mentat-cli/opendoor/opendoor-mcp:latest
```

## 🌐 Reverse Proxy Setup

### Nginx Configuration

```nginx
upstream opendoor_mcp {
    server localhost:3000;
}

upstream opendoor_docs {
    server localhost:3001;
}

server {
    listen 80;
    server_name your-domain.com;
    
    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    # MCP Server API
    location /api/ {
        proxy_pass http://opendoor_mcp/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
    
    # SSE endpoint
    location /sse {
        proxy_pass http://opendoor_mcp/sse;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache off;
        proxy_buffering off;
    }
    
    # Documentation
    location / {
        proxy_pass http://opendoor_docs/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Traefik Configuration

```yaml
version: '3.8'

services:
  mcp-server:
    image: ghcr.io/openhands-mentat-cli/opendoor/opendoor-mcp:latest
    restart: unless-stopped
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      - MCP_TRANSPORT=sse
      - NODE_ENV=production
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.mcp-api.rule=Host(`your-domain.com`) && PathPrefix(`/api`)"
      - "traefik.http.routers.mcp-api.tls=true"
      - "traefik.http.routers.mcp-api.tls.certresolver=letsencrypt"
      - "traefik.http.services.mcp-api.loadbalancer.server.port=3000"
      - "traefik.http.routers.mcp-docs.rule=Host(`your-domain.com`)"
      - "traefik.http.routers.mcp-docs.tls=true"
      - "traefik.http.services.mcp-docs.loadbalancer.server.port=3001"
```

## 📊 Monitoring

### Health Checks

```bash
# Basic health check
curl -f http://localhost:3000/health

# Detailed health check with metrics
curl -s http://localhost:3000/health | jq
```

### Prometheus Metrics

The server exposes metrics at `/metrics` endpoint:

```bash
curl http://localhost:3000/metrics
```

### Log Monitoring

```bash
# View container logs
docker logs opendoor-mcp -f

# With log rotation
docker logs opendoor-mcp --since=1h --tail=100
```

## 🔄 Updates and Maintenance

### Updating the Container

```bash
# Pull latest image
docker pull ghcr.io/openhands-mentat-cli/opendoor/opendoor-mcp:latest

# Stop current container
docker stop opendoor-mcp

# Remove old container
docker rm opendoor-mcp

# Start new container
docker run -d --name opendoor-mcp \
  --restart unless-stopped \
  -p 3000:3000 \
  -p 3001:3001 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e MCP_TRANSPORT=sse \
  ghcr.io/openhands-mentat-cli/opendoor/opendoor-mcp:latest
```

### Zero-Downtime Updates with Docker Compose

```bash
# Update with rolling deployment
docker-compose -f docker-compose.prod.yml pull
docker-compose -f docker-compose.prod.yml up -d --no-deps mcp-server
```

## 🔐 Security Best Practices

### Container Security

1. **Run as non-root user**: The container runs as user `nodejs` (UID 1001)
2. **Read-only filesystem**: Use `--read-only` flag
3. **Resource limits**: Set memory and CPU limits
4. **Network isolation**: Use custom Docker networks

```bash
# Create secure deployment
docker network create opendoor-network

docker run -d --name opendoor-mcp \
  --network opendoor-network \
  --restart unless-stopped \
  --user 1001:1001 \
  --read-only \
  --tmpfs /tmp \
  --memory=1g \
  --cpus=1.0 \
  -p 3000:3000 \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -e MCP_TRANSPORT=sse \
  ghcr.io/openhands-mentat-cli/opendoor/opendoor-mcp:latest
```

### Network Security

1. **Use HTTPS**: Always use TLS in production
2. **Firewall rules**: Restrict access to necessary ports
3. **Rate limiting**: Configure rate limits in reverse proxy
4. **CORS**: Set appropriate CORS origins

## 🚨 Troubleshooting

### Common Issues

1. **Container won't start**:
   ```bash
   docker logs opendoor-mcp
   ```

2. **Health check fails**:
   ```bash
   curl -v http://localhost:3000/health
   ```

3. **Docker socket permission denied**:
   ```bash
   sudo chown root:docker /var/run/docker.sock
   sudo chmod 660 /var/run/docker.sock
   ```

4. **Redis connection issues**:
   ```bash
   docker exec -it opendoor-redis redis-cli ping
   ```

### Performance Tuning

```bash
# Increase container resources
docker run -d --name opendoor-mcp \
  --memory=2g \
  --cpus=2.0 \
  --restart unless-stopped \
  -p 3000:3000 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  ghcr.io/openhands-mentat-cli/opendoor/opendoor-mcp:latest
```

## 📈 Scaling

### Horizontal Scaling

```yaml
version: '3.8'

services:
  mcp-server:
    image: ghcr.io/openhands-mentat-cli/opendoor/opendoor-mcp:latest
    deploy:
      replicas: 3
      update_config:
        parallelism: 1
        delay: 10s
      restart_policy:
        condition: on-failure
    ports:
      - "3000-3002:3000"
    environment:
      - MCP_TRANSPORT=sse
      - REDIS_URL=redis://redis:6379
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
    depends_on:
      - mcp-server

volumes:
  redis_data:
```

## 📞 Support

For production support and issues:

- **GitHub Issues**: [https://github.com/openhands-mentat-cli/Opendoor/issues](https://github.com/openhands-mentat-cli/Opendoor/issues)
- **Documentation**: Access at `http://your-domain:3001` when running
- **Health Status**: Monitor at `http://your-domain:3000/health`

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.