#!/usr/bin/env node

import { MCPServer } from '@ronangrant/mcp-framework';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { Logger } from './utils/Logger.js';
import { ConfigService } from './services/ConfigService.js';
import { SessionManager } from './session/SessionManager.js';
import { LocalExecutionManager } from './container/LocalExecutionManager.js';
import { SecurityManager } from './security/SecurityManager.js';
import { HealthService } from './services/HealthService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = Logger.getInstance();

// Global services that will be injected into tools
export let globalServices: {
  sessionManager: SessionManager;
  containerManager: LocalExecutionManager;
  securityManager: SecurityManager;
  configService: ConfigService;
  healthService: HealthService;
} | null = null;

// Web interface for documentation and configuration
async function startWebInterface(port: number) {
  const app = express();
  
  app.use(cors());
  app.use(express.json());

  // Health endpoint
  app.get('/health', (req: Request, res: Response) => {
    res.json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      services: globalServices ? {
        sessionManager: 'ready',
        containerManager: 'ready',
        healthService: 'ready'
      } : {}
    });
  });

  // MCP configuration endpoints
  app.get('/config/sse', (req: Request, res: Response) => {
    const baseUrl = `${req.protocol}://${req.get('host')}`.replace(`:${port}`, `:${port - 1}`);
    res.json({
      mcpServers: {
        "opendoor": {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-everything"],
          env: {
            MCP_SERVER_URL: `${baseUrl}/sse`
          }
        }
      }
    });
  });

  app.get('/config/stdio', (req: Request, res: Response) => {
    res.json({
      mcpServers: {
        "opendoor": {
          command: "docker",
          args: [
            "run", "-i", "--rm",
            "ghcr.io/openhands-mentat-cli/opendoor/opendoor-mcp:latest"
          ]
        }
      }
    });
  });

  // Documentation page
  app.get('/', (req: Request, res: Response) => {
    const baseUrl = `${req.protocol}://${req.get('host')}`.replace(`:${port}`, `:${port - 1}`);
    res.send(generateDocumentationHTML(baseUrl, port - 1));
  });

  return new Promise<void>((resolve) => {
    app.listen(port, '0.0.0.0', () => {
      logger.info(`📚 Web interface started on http://localhost:${port}`);
      resolve();
    });
  });
}

function generateDocumentationHTML(baseUrl: string, mcpPort: number): string {
  const sseConfig = {
    mcpServers: {
      "opendoor": {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-everything"],
        env: {
          MCP_SERVER_URL: `${baseUrl}/sse`
        }
      }
    }
  };

  const stdioConfig = {
    mcpServers: {
      "opendoor": {
        command: "docker",
        args: [
          "run", "-i", "--rm",
          "ghcr.io/openhands-mentat-cli/opendoor/opendoor-mcp:latest"
        ]
      }
    }
  };

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Opendoor MCP Server</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #2c3e50; border-bottom: 3px solid #3498db; padding-bottom: 10px; }
        h2 { color: #34495e; margin-top: 30px; }
        .config-section { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3498db; }
        pre { background: #2c3e50; color: #ecf0f1; padding: 15px; border-radius: 5px; overflow-x: auto; }
        .copy-btn { background: #3498db; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer; margin-top: 10px; }
        .copy-btn:hover { background: #2980b9; }
        .feature { background: #e8f5e8; padding: 15px; margin: 10px 0; border-radius: 5px; border-left: 4px solid #27ae60; }
        .endpoint { background: #fff3cd; padding: 10px; margin: 5px 0; border-radius: 4px; border-left: 3px solid #ffc107; }
        .status { display: inline-block; padding: 4px 8px; border-radius: 12px; font-size: 12px; font-weight: bold; }
        .status.healthy { background: #d4edda; color: #155724; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚪 Opendoor MCP Server</h1>
        <p><span class="status healthy">● RUNNING</span> Production-grade Model Context Protocol server</p>
        
        <h2>🔗 Connection Configurations</h2>
        
        <div class="config-section">
            <h3>📡 SSE (Server-Sent Events) Configuration</h3>
            <p>For web-based LLM clients and development:</p>
            <pre id="sse-config">${JSON.stringify(sseConfig, null, 2)}</pre>
            <button class="copy-btn" onclick="copyToClipboard('sse-config')">Copy SSE Config</button>
            <div class="endpoint">
                <strong>Endpoint:</strong> <code>${baseUrl}/sse</code>
            </div>
        </div>

        <div class="config-section">
            <h3>📟 STDIO Configuration</h3>
            <p>For command-line clients and production deployments:</p>
            <pre id="stdio-config">${JSON.stringify(stdioConfig, null, 2)}</pre>
            <button class="copy-btn" onclick="copyToClipboard('stdio-config')">Copy STDIO Config</button>
        </div>

        <h2>🛠️ Available Tools</h2>
        <div class="feature">
            <strong>execute_code</strong> - Execute code in multiple languages (Python, JavaScript, TypeScript, Bash, etc.)
        </div>
        <div class="feature">
            <strong>create_vscode_session</strong> - Launch VS Code development environments
        </div>
        <div class="feature">
            <strong>create_playwright_session</strong> - Start browser automation sessions
        </div>
        <div class="feature">
            <strong>manage_sessions</strong> - List, monitor, and cleanup active sessions
        </div>
        <div class="feature">
            <strong>system_health</strong> - Monitor system resources and service health
        </div>

        <h2>📚 Resources</h2>
        <div class="feature">
            <strong>system_config</strong> - Server configuration and capabilities
        </div>

        <h2>💡 Prompts</h2>
        <div class="feature">
            <strong>usage_guide</strong> - Comprehensive usage instructions and examples
        </div>

        <h2>🐳 Docker Usage</h2>
        <pre>
# Pull and run the MCP server
docker pull ghcr.io/openhands-mentat-cli/opendoor/opendoor-mcp:latest

# Run with STDIO transport
docker run -i --rm \\
  ghcr.io/openhands-mentat-cli/opendoor/opendoor-mcp:latest

# Run with SSE transport
docker run -d --rm \\
  -p 3000:3000 -p 3001:3001 \\
  -e MCP_TRANSPORT=sse \\
  ghcr.io/openhands-mentat-cli/opendoor/opendoor-mcp:latest
        </pre>

        <h2>🔍 API Endpoints</h2>
        <div class="endpoint">GET /health - Server health status</div>
        <div class="endpoint">GET /config/sse - SSE configuration JSON</div>
        <div class="endpoint">GET /config/stdio - STDIO configuration JSON</div>
        <div class="endpoint">GET /sse - MCP SSE endpoint</div>

        <h2>📊 System Status</h2>
        <div id="status">Loading...</div>
    </div>

    <script>
        function copyToClipboard(elementId) {
            const element = document.getElementById(elementId);
            const text = element.textContent;
            navigator.clipboard.writeText(text).then(() => {
                const btn = element.nextElementSibling;
                const originalText = btn.textContent;
                btn.textContent = 'Copied!';
                btn.style.background = '#27ae60';
                setTimeout(() => {
                    btn.textContent = originalText;
                    btn.style.background = '#3498db';
                }, 2000);
            }, 2000);
        }

        // Load system status
        fetch('/health')
            .then(response => response.json())
            .then(data => {
                document.getElementById('status').innerHTML = \`
                    <div class="feature">
                        <strong>Status:</strong> \${data.status}<br>
                        <strong>Timestamp:</strong> \${data.timestamp}<br>
                        <strong>Services:</strong> \${Object.entries(data.services).map(([k,v]) => \`\${k}: \${v}\`).join(', ')}
                    </div>
                \`;
            })
            .catch(() => {
                document.getElementById('status').innerHTML = '<div class="feature">Status: Unable to fetch</div>';
            });
    </script>
</body>
</html>
  `;
}

async function initializeServices() {
  const startTime = Date.now();
  logger.info('🚀 Starting Opendoor MCP Server initialization...');

  try {
    // Initialize services in parallel for faster boot time
    const [
      configService,
      sessionManager,
      containerManager,
      securityManager,
      healthService
    ] = await Promise.all([
      Promise.resolve(new ConfigService()),
      new SessionManager().initialize(),
      new LocalExecutionManager().initialize(),
      Promise.resolve(new SecurityManager()),
      Promise.resolve(new HealthService())
    ]);

    const bootTime = Date.now() - startTime;
    logger.info(`✅ Services initialized in ${bootTime}ms`);

    globalServices = {
      configService,
      sessionManager,
      containerManager,
      securityManager,
      healthService
    };

    return globalServices;
  } catch (error) {
    logger.error('❌ Failed to initialize services:', error);
    throw error;
  }
}

async function main() {
  try {
    // Initialize services first
    await initializeServices();

    // Determine transport type from environment
    const useSSE = process.env.MCP_TRANSPORT === 'sse' || process.env.NODE_ENV === 'production';
    const port = parseInt(process.env.PORT || '3000');

    // Create MCP server with appropriate transport
    const server = new MCPServer({
      name: "opendoor-mcp-server",
      version: "2.0.0",
      transport: useSSE ? {
        type: "sse",
        options: {
          port,
          cors: {
            allowOrigin: process.env.ALLOWED_ORIGINS || "*",
            allowMethods: "GET, POST, OPTIONS",
            allowHeaders: "Content-Type, Authorization, X-API-Key, X-Client-ID",
            exposeHeaders: "Content-Type, Authorization, X-API-Key",
            maxAge: "86400"
          }
        }
      } : {
        type: "stdio"
      }
    });

    // Graceful shutdown handler
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      
      try {
        if (globalServices) {
          await Promise.all([
            globalServices.sessionManager?.cleanup(),
            globalServices.containerManager?.cleanup()
          ]);
        }
        
        await server.stop();
        logger.info('Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        logger.error(`Error during shutdown: ${error}`);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

    // Unhandled rejection handler
    process.on('unhandledRejection', (reason, promise) => {
      logger.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
    });

    // Uncaught exception handler
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      process.exit(1);
    });

    // Start the server
    logger.info(`🎉 Starting Opendoor MCP Server with ${useSSE ? 'SSE' : 'STDIO'} transport`);
    if (useSSE) {
      logger.info(`📡 SSE endpoint will be available on port ${port}`);
    }
    logger.info('🔧 Multi-language code execution environment ready');
    logger.info('🖥️  VS Code integration enabled');
    logger.info('🎭 Playwright browser automation ready');
    
    // If using SSE, also start a web interface
    if (useSSE) {
      await startWebInterface(port + 1);
      logger.info(`📚 Documentation: http://localhost:${port + 1}`);
    }
    
    await server.start();

  } catch (error) {
    logger.error('💥 Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
main();
