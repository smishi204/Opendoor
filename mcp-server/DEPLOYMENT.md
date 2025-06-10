# 🚀 Opendoor MCP Server Deployment Guide

This guide covers various deployment scenarios for the Opendoor MCP Server.

## 📋 Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for local development)
- Redis (for production deployments)
- Access to Docker socket (for container management features)

## 🐳 Docker Deployment

### Quick Start with Docker

```bash
# Pull the latest image
docker pull ghcr.io/create-fun-work/opendoor/opendoor-mcp:latest

# Run with SSE transport (recommended for web clients)
docker run -d --name opendoor-mcp \
  -p 3000:3000 \
  -p 3001:3001 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e MCP_TRANSPORT=sse \
  -e HOST=0.0.0.0 \
  -e PORT=3000 \
  ghcr.io/create-fun-work/opendoor/opendoor-mcp:latest

# Access the documentation at http://localhost:3001
# MCP SSE endpoint available at http://localhost:3000/sse
```

### Docker Compose (Recommended)

Create a `docker-compose.yml` file:

```yaml
version: '3.8'

services:
  mcp-server:
    image: ghcr.io/create-fun-work/opendoor/opendoor-mcp:latest
    ports:
      - "3000:3000"
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - MCP_TRANSPORT=sse
      - HOST=0.0.0.0
      - PORT=3000
      - REDIS_URL=redis://redis:6379
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    depends_on:
      - redis
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes
    restart: unless-stopped

volumes:
  redis_data:
```

Deploy with:

```bash
docker-compose up -d
```

## ☁️ Cloud Deployment

### AWS ECS

1. **Create Task Definition**:

```json
{
  "family": "opendoor-mcp",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::ACCOUNT:role/ecsTaskExecutionRole",
  "containerDefinitions": [
    {
      "name": "opendoor-mcp",
      "image": "ghcr.io/create-fun-work/opendoor/opendoor-mcp:latest",
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "MCP_TRANSPORT",
          "value": "sse"
        },
        {
          "name": "REDIS_URL",
          "value": "redis://your-redis-cluster.cache.amazonaws.com:6379"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/opendoor-mcp",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

2. **Create Service** with Application Load Balancer
3. **Configure Redis** using AWS ElastiCache

### Google Cloud Run

```bash
# Build and push to Google Container Registry
docker build -t gcr.io/PROJECT-ID/opendoor-mcp ./mcp-server
docker push gcr.io/PROJECT-ID/opendoor-mcp

# Deploy to Cloud Run
gcloud run deploy opendoor-mcp \
  --image gcr.io/PROJECT-ID/opendoor-mcp \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 3000 \
  --set-env-vars MCP_TRANSPORT=sse,REDIS_URL=redis://your-redis-instance:6379
```

### Azure Container Instances

```bash
az container create \
  --resource-group myResourceGroup \
  --name opendoor-mcp \
  --image ghcr.io/create-fun-work/opendoor/opendoor-mcp:latest \
  --ports 3000 3001 \
  --environment-variables MCP_TRANSPORT=sse REDIS_URL=redis://your-redis.redis.cache.windows.net:6380 \
  --cpu 1 \
  --memory 2
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `MCP_TRANSPORT` | Transport type: `sse` or `stdio` | `stdio` | No |
| `HOST` | Server host | `localhost` | No |
| `PORT` | Server port | `3000` | No |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` | Yes (production) |
| `NODE_ENV` | Environment | `development` | No |
| `LOG_LEVEL` | Logging level | `info` | No |
| `MAX_SESSIONS` | Maximum concurrent sessions | `10` | No |
| `SESSION_TIMEOUT` | Session timeout in minutes | `30` | No |

### Redis Configuration

For production deployments, configure Redis with:

```redis
# redis.conf
maxmemory 256mb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
save 60 10000
```

## 🔒 Security Considerations

### Network Security

- Use HTTPS in production
- Configure firewall rules to restrict access
- Use VPC/private networks when possible

### Container Security

- Run containers as non-root user (already configured)
- Use read-only file systems where possible
- Limit container resources (CPU, memory)
- Regular security updates

### Access Control

- Implement authentication for SSE endpoints
- Use API keys for client access
- Monitor and log all requests

## 📊 Monitoring and Logging

### Health Checks

The server provides health check endpoints:

- `GET /health` - Basic health status
- System health via `system_health` tool

### Logging

Configure structured logging:

```javascript
// Custom logging configuration
{
  "level": "info",
  "format": "json",
  "transports": [
    {
      "type": "file",
      "filename": "/var/log/mcp-server.log"
    },
    {
      "type": "console"
    }
  ]
}
```

### Metrics Collection

Integrate with monitoring systems:

- Prometheus metrics endpoint
- CloudWatch (AWS)
- Stackdriver (GCP)
- Application Insights (Azure)

## 🔄 Scaling

### Horizontal Scaling

Deploy multiple instances behind a load balancer:

```yaml
# docker-compose.scale.yml
version: '3.8'

services:
  mcp-server:
    image: ghcr.io/create-fun-work/opendoor/opendoor-mcp:latest
    environment:
      - REDIS_URL=redis://redis:6379
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    depends_on:
      - redis

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
    depends_on:
      - mcp-server

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  redis_data:
```

Scale with:

```bash
docker-compose -f docker-compose.scale.yml up -d --scale mcp-server=3
```

### Vertical Scaling

Adjust container resources:

```bash
docker run -d \
  --cpus="2.0" \
  --memory="4g" \
  -p 3000:3000 \
  ghcr.io/create-fun-work/opendoor/opendoor-mcp:latest
```

## 🚨 Troubleshooting

### Common Issues

1. **Container fails to start**
   - Check Docker socket permissions
   - Verify Redis connectivity
   - Review environment variables

2. **High memory usage**
   - Monitor session cleanup
   - Adjust session timeout
   - Check for memory leaks

3. **Connection timeouts**
   - Increase timeout values
   - Check network connectivity
   - Verify firewall rules

### Debug Mode

Enable debug logging:

```bash
docker run -d \
  -e LOG_LEVEL=debug \
  -e NODE_ENV=development \
  ghcr.io/create-fun-work/opendoor/opendoor-mcp:latest
```

### Log Analysis

Monitor logs for issues:

```bash
# View container logs
docker logs -f opendoor-mcp

# Search for errors
docker logs opendoor-mcp 2>&1 | grep ERROR

# Monitor resource usage
docker stats opendoor-mcp
```

## 📞 Support

- **Documentation**: Available at the web interface when running
- **Issues**: Report on GitHub repository
- **Community**: Join discussions for help and best practices