# 🐳 Complete Docker Deployment Guide for Opendoor MCP Server

This guide covers deploying the complete Opendoor MCP Server with all tools, services, and capabilities using Docker.

## 🚀 Quick Start - Complete MCP Server

### Single Container Deployment

```bash
# Pull and run the complete MCP server
docker run -d --name opendoor-mcp-complete \
  -p 3000:3000 \
  -p 3001:3001 \
  -p 6379:6379 \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -e MCP_TRANSPORT=sse \
  -e NODE_ENV=production \
  -e LOG_LEVEL=info \
  ghcr.io/openhands-mentat-cli/opendoor-opendoor-mcp:latest

# Check health
curl http://localhost:3000/health

# Access web interface
open http://localhost:3001
```

### Docker Compose Deployment (Recommended)

```bash
# Clone the repository
git clone https://github.com/openhands-mentat-cli/Opendoor.git
cd Opendoor

# Deploy complete MCP server
docker-compose -f docker-compose.complete.yml up -d

# Check status
docker-compose -f docker-compose.complete.yml ps

# View logs
docker-compose -f docker-compose.complete.yml logs -f opendoor-mcp
```

## 🛠️ Complete MCP Server Features

The complete Docker image includes:

### 🔧 Core Tools
- **execute_code** - Multi-language code execution (Python, JavaScript, TypeScript, Bash)
- **create_vscode_session** - VS Code development environments
- **create_playwright_session** - Browser automation with Playwright
- **manage_sessions** - Session lifecycle management
- **system_health** - System monitoring and health checks

### 📚 Resources
- **system_config** - Server configuration and capabilities
- **usage_guide** - Comprehensive usage instructions

### 🎯 Prompts
- **usage_guide** - Interactive usage guidance

### 🔧 System Components
- **Redis** - Session management and caching
- **Supervisor** - Process management
- **Health Monitoring** - Automated health checks
- **Security** - Rate limiting and input validation
- **Logging** - Structured logging with Winston

### 🐍 Python Environment
Pre-installed packages:
- Scientific computing: numpy, pandas, matplotlib, scipy, scikit-learn
- Web tools: requests, httpx, aiohttp, fastapi, flask
- Data processing: beautifulsoup4, lxml, openpyxl
- Development: jupyter, ipython, pytest
- Machine learning: torch, transformers
- Image processing: pillow, opencv-python-headless

## 🔧 Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `production` | Node.js environment |
| `MCP_TRANSPORT` | `sse` | Transport type: `sse` or `stdio` |
| `HOST` | `0.0.0.0` | Server host |
| `PORT` | `3000` | MCP server port |
| `WEB_PORT` | `3001` | Web interface port |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection URL |
| `LOG_LEVEL` | `info` | Logging level |
| `SESSION_TIMEOUT` | `3600` | Session timeout in seconds |
| `MAX_SESSIONS` | `10` | Maximum concurrent sessions |
| `CONTAINER_TIMEOUT` | `1800` | Container timeout in seconds |
| `SECURITY_ENABLED` | `true` | Enable security features |
| `RATE_LIMIT_ENABLED` | `true` | Enable rate limiting |

### Advanced Configuration

```bash
# Custom configuration
docker run -d --name opendoor-mcp-custom \
  -p 3000:3000 \
  -p 3001:3001 \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -e MCP_TRANSPORT=sse \
  -e NODE_ENV=production \
  -e LOG_LEVEL=debug \
  -e SESSION_TIMEOUT=7200 \
  -e MAX_SESSIONS=20 \
  -e SECURITY_ENABLED=true \
  -e RATE_LIMIT_ENABLED=true \
  -e MCP_TOOLS_ENABLED=execute_code,create_vscode_session,system_health \
  -e NODE_OPTIONS="--max-old-space-size=4096" \
  ghcr.io/openhands-mentat-cli/opendoor-opendoor-mcp:latest
```

## 🔍 Health Monitoring

### Built-in Health Checks

The container includes comprehensive health monitoring:

```bash
# Check container health
docker inspect opendoor-mcp-complete --format='{{.State.Health.Status}}'

# Manual health check
curl -s http://localhost:3000/health | jq

# Redis health check
redis-cli -h localhost -p 6379 ping
```

### Health Endpoints

- `GET /health` - Overall system health
- `GET /health/detailed` - Detailed component status
- `GET /metrics` - Prometheus metrics

### Example Health Response

```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "services": {
    "mcp_server": "healthy",
    "redis": "healthy",
    "docker": "available",
    "sessions": {
      "active": 3,
      "max": 10
    }
  },
  "system": {
    "memory_usage": "45%",
    "cpu_usage": "12%",
    "disk_usage": "23%"
  },
  "tools": {
    "execute_code": "ready",
    "create_vscode_session": "ready",
    "create_playwright_session": "ready",
    "manage_sessions": "ready",
    "system_health": "ready"
  }
}
```

## 📊 Monitoring with Docker Compose

Deploy with monitoring stack:

```bash
# Deploy with monitoring
docker-compose -f docker-compose.complete.yml --profile monitoring up -d

# Access monitoring interfaces
open http://localhost:9090  # Prometheus
open http://localhost:3002  # Grafana (admin/admin)
open http://localhost:3100  # Loki
```

## 🔒 Security Configuration

### Production Security Setup

```bash
# Secure production deployment
docker run -d --name opendoor-mcp-secure \
  --restart unless-stopped \
  --user 1001:1001 \
  --read-only \
  --tmpfs /tmp \
  --tmpfs /app/temp \
  --memory=2g \
  --cpus=2.0 \
  --security-opt=no-new-privileges:true \
  --cap-drop=ALL \
  --cap-add=NET_BIND_SERVICE \
  -p 3000:3000 \
  -p 3001:3001 \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -e MCP_TRANSPORT=sse \
  -e NODE_ENV=production \
  -e SECURITY_ENABLED=true \
  -e RATE_LIMIT_ENABLED=true \
  -e ALLOWED_ORIGINS=https://your-domain.com \
  ghcr.io/openhands-mentat-cli/opendoor-opendoor-mcp:latest
```

### Network Security

```yaml
# docker-compose.security.yml
version: '3.8'
services:
  opendoor-mcp:
    image: ghcr.io/openhands-mentat-cli/opendoor-opendoor-mcp:latest
    networks:
      - internal
      - external
    environment:
      - ALLOWED_ORIGINS=https://your-domain.com
      - CORS_ENABLED=true
      - HELMET_ENABLED=true

networks:
  internal:
    internal: true
  external:
    driver: bridge
```

## 🚀 Scaling and Load Balancing

### Horizontal Scaling

```yaml
# docker-compose.scale.yml
version: '3.8'
services:
  opendoor-mcp:
    image: ghcr.io/openhands-mentat-cli/opendoor-opendoor-mcp:latest
    deploy:
      replicas: 3
      update_config:
        parallelism: 1
        delay: 10s
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
    environment:
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis
      - nginx

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf
```

### Load Balancer Configuration (Nginx)

```nginx
upstream opendoor_mcp {
    least_conn;
    server opendoor-mcp-1:3000 max_fails=3 fail_timeout=30s;
    server opendoor-mcp-2:3000 max_fails=3 fail_timeout=30s;
    server opendoor-mcp-3:3000 max_fails=3 fail_timeout=30s;
}

server {
    listen 80;
    server_name mcp.your-domain.com;
    
    location / {
        proxy_pass http://opendoor_mcp;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Health check
        location /health {
            access_log off;
            proxy_pass http://opendoor_mcp/health;
        }
    }
}
```

## 🔄 Updates and Maintenance

### Rolling Updates

```bash
# Pull latest image
docker pull ghcr.io/openhands-mentat-cli/opendoor-opendoor-mcp:latest

# Rolling update with Docker Compose
docker-compose -f docker-compose.complete.yml pull
docker-compose -f docker-compose.complete.yml up -d --no-deps opendoor-mcp

# Verify update
docker-compose -f docker-compose.complete.yml ps
curl http://localhost:3000/health
```

### Backup and Restore

```bash
# Backup persistent data
docker run --rm -v opendoor_sessions:/data -v $(pwd):/backup alpine \
  tar czf /backup/opendoor-sessions-$(date +%Y%m%d).tar.gz -C /data .

# Backup Redis data
docker exec opendoor-redis redis-cli BGSAVE
docker cp opendoor-redis:/data/dump.rdb ./backup/

# Restore data
docker run --rm -v opendoor_sessions:/data -v $(pwd):/backup alpine \
  tar xzf /backup/opendoor-sessions-20240115.tar.gz -C /data
```

## 🐛 Troubleshooting

### Common Issues

1. **Container won't start**
   ```bash
   # Check logs
   docker logs opendoor-mcp-complete --tail 50
   
   # Check health
   docker inspect opendoor-mcp-complete --format='{{.State.Health}}'
   ```

2. **Health check fails**
   ```bash
   # Test endpoints manually
   curl -v http://localhost:3000/health
   redis-cli -h localhost -p 6379 ping
   
   # Check internal services
   docker exec opendoor-mcp-complete supervisorctl status
   ```

3. **High memory usage**
   ```bash
   # Monitor resources
   docker stats opendoor-mcp-complete
   
   # Adjust memory limits
   docker update --memory=4g opendoor-mcp-complete
   ```

4. **Session management issues**
   ```bash
   # Check Redis
   docker exec opendoor-mcp-complete redis-cli -p 6379 info
   
   # Clear sessions
   docker exec opendoor-mcp-complete redis-cli -p 6379 FLUSHDB
   ```

### Performance Tuning

```bash
# Optimize for high load
docker run -d --name opendoor-mcp-optimized \
  --memory=4g \
  --cpus=4.0 \
  --ulimit nofile=65536:65536 \
  -e NODE_OPTIONS="--max-old-space-size=3072" \
  -e UV_THREADPOOL_SIZE=8 \
  -e MAX_SESSIONS=50 \
  -e SESSION_TIMEOUT=1800 \
  -p 3000:3000 \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  ghcr.io/openhands-mentat-cli/opendoor-opendoor-mcp:latest
```

## 📞 Support

For Docker deployment support:

- **GitHub Issues**: [https://github.com/openhands-mentat-cli/Opendoor/issues](https://github.com/openhands-mentat-cli/Opendoor/issues)
- **Docker Hub**: [https://github.com/openhands-mentat-cli/Opendoor/pkgs/container/opendoor%2Fopendoor-mcp](https://github.com/openhands-mentat-cli/Opendoor/pkgs/container/opendoor%2Fopendoor-mcp)
- **Documentation**: Access at `http://localhost:3001` when running

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.