# 🚪 Opendoor MCP Server

A production-grade Model Context Protocol (MCP) server built with the mcp-framework, providing secure code execution, VS Code integration, and browser automation capabilities.

## 🚀 Quick Start

### Using Docker (Recommended)

```bash
# Pull and run with SSE transport
docker run -d --name opendoor-mcp \
  -p 3000:3000 -p 3001:3001 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e MCP_TRANSPORT=sse \
  ghcr.io/openhands-mentat-cli/opendoor/opendoor-mcp:latest

# Access documentation at http://localhost:3001
```

### Using Docker Compose

```bash
git clone https://github.com/openhands-mentat-cli/Opendoor.git
cd Opendoor/mcp-server
docker-compose up -d
```

## 🔗 LLM Integration

### SSE Configuration (Web-based LLMs)

Add this to your LLM client configuration:

```json
{
  "mcpServers": {
    "opendoor": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-everything"],
      "env": {
        "MCP_SERVER_URL": "http://localhost:3000/sse"
      }
    }
  }
}
```

### STDIO Configuration (Command-line)

```json
{
  "mcpServers": {
    "opendoor": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-v", "/var/run/docker.sock:/var/run/docker.sock",
        "ghcr.io/openhands-mentat-cli/opendoor/opendoor-mcp:latest"
      ]
    }
  }
}
```

## 🛠️ Available Tools

- **execute_code** - Execute code in multiple languages (Python, JavaScript, TypeScript, Bash, etc.)
- **create_vscode_session** - Launch VS Code development environments
- **create_playwright_session** - Start browser automation sessions
- **manage_sessions** - List, monitor, and cleanup active sessions
- **system_health** - Monitor system resources and service health

## 📚 Resources

- **system_config** - Server configuration and capabilities

## 💡 Prompts

- **usage_guide** - Comprehensive usage instructions and examples

## 🔧 Development

### Local Development

```bash
# Clone the repository
git clone https://github.com/openhands-mentat-cli/Opendoor.git
cd Opendoor/mcp-server

# Install dependencies
npm install

# Start in development mode (no Docker required)
npm run dev

# Build for production
npm run build
npm start
```

### Environment Variables

- `MCP_TRANSPORT` - Transport type: `sse` or `stdio` (default: `stdio`)
- `HOST` - Server host (default: `localhost`)
- `PORT` - Server port (default: `3000`)
- `REDIS_URL` - Redis connection URL (default: `redis://localhost:6379`)
- `NODE_ENV` - Environment: `development` or `production`

## 🐳 Docker Configuration

### Build Custom Image

```bash
docker build -t my-opendoor-mcp .
```

### Environment Variables for Docker

```bash
docker run -d \
  -p 3000:3000 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e MCP_TRANSPORT=sse \
  -e REDIS_URL=redis://localhost:6379 \
  my-opendoor-mcp
```

## 🔒 Security Features

- Rate limiting on all endpoints
- Input validation and sanitization
- Secure container isolation
- Resource usage monitoring
- Session management and cleanup

## 📊 Monitoring

- Health check endpoint: `GET /health`
- System metrics via `system_health` tool
- Comprehensive logging with Winston
- Redis-based session tracking

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.

## 🆘 Support

- Documentation: http://localhost:3001 (when running)
- Issues: https://github.com/openhands-mentat-cli/Opendoor/issues
- Discussions: https://github.com/openhands-mentat-cli/Opendoor/discussions