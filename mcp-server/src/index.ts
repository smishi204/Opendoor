#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import cors from 'cors';
import { Logger } from './utils/Logger.js';
import { ConfigService } from './services/ConfigService.js';
import { SessionManager } from './session/SessionManager.js';
import { LocalExecutionManager } from './container/LocalExecutionManager.js';
import { SecurityManager } from './security/SecurityManager.js';
import { HealthService } from './services/HealthService.js';
import { executeCodeTool } from './tools/ExecuteCodeTool.js';
import { createVSCodeSessionTool } from './tools/CreateVSCodeSessionTool.js';
import { createPlaywrightSessionTool } from './tools/CreatePlaywrightSessionTool.js';
import { manageSessionsTool } from './tools/ManageSessionsTool.js';
import { systemHealthTool } from './tools/SystemHealthTool.js';

const logger = Logger.getInstance();

// Service dependencies container
export interface ServiceContainer {
  sessionManager: SessionManager;
  executionManager: LocalExecutionManager;
  securityManager: SecurityManager;
  configService: ConfigService;
  healthService: HealthService;
}

let services: ServiceContainer | null = null;

async function initializeServices(): Promise<ServiceContainer> {
  const startTime = Date.now();
  logger.info('🚀 Starting Opendoor MCP Server initialization...');

  try {
    // Initialize services in parallel for faster boot time
    const [
      configService,
      sessionManager,
      executionManager,
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

    return {
      configService,
      sessionManager,
      executionManager,
      securityManager,
      healthService
    };
  } catch (error) {
    logger.error('❌ Failed to initialize services:', error);
    throw error;
  }
}

function createServer(): Server {
  const server = new Server(
    {
      name: 'opendoor-mcp-server',
      version: '2.0.0',
    },
    {
      capabilities: {
        tools: {},
        prompts: {},
        resources: {
          subscribe: false,
          listChanged: false
        }
      },
    }
  );

  // Tool handlers
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        executeCodeTool.definition,
        createVSCodeSessionTool.definition,
        createPlaywrightSessionTool.definition,
        manageSessionsTool.definition,
        systemHealthTool.definition
      ]
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (!services) {
      throw new Error('Services not initialized');
    }

    const { name, arguments: args } = request.params;

    switch (name) {
      case 'execute_code':
        return await executeCodeTool.execute(args, services);
      
      case 'create_vscode_session':
        return await createVSCodeSessionTool.execute(args, services);
      
      case 'create_playwright_session':
        return await createPlaywrightSessionTool.execute(args, services);
      
      case 'manage_sessions':
        return await manageSessionsTool.execute(args, services);
      
      case 'system_health':
        return await systemHealthTool.execute(args, services);
      
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  });

  // Note: Prompt and Resource handlers would be added here when supported by the MCP SDK
  // For now, we focus on the core tool functionality

  return server;
}

async function startWebInterface(port: number): Promise<void> {
  const app = express();
  
  app.use(cors());
  app.use(express.json());

  // Health endpoint
  app.get('/health', async (req, res) => {
    try {
      const healthStatus = services ? await services.healthService.getHealthStatus() : null;
      res.json({ 
        status: healthStatus?.status || 'initializing', 
        timestamp: new Date().toISOString(),
        services: services ? {
          sessionManager: 'ready',
          executionManager: 'ready',
          healthService: 'ready'
        } : {}
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // MCP configuration endpoints
  app.get('/config/stdio', (req, res) => {
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
  app.get('/', (req, res) => {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.send(generateDocumentationHTML(baseUrl));
  });

  return new Promise<void>((resolve) => {
    app.listen(port, '0.0.0.0', () => {
      logger.info(`📚 Web interface started on http://localhost:${port}`);
      resolve();
    });
  });
}

function generateDocumentationHTML(baseUrl: string): string {
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
        
        <h2>🔗 Connection Configuration</h2>
        
        <div class="config-section">
            <h3>📟 STDIO Configuration</h3>
            <p>For command-line clients and production deployments:</p>
            <pre id="stdio-config">${JSON.stringify(stdioConfig, null, 2)}</pre>
            <button class="copy-btn" onclick="copyToClipboard('stdio-config')">Copy STDIO Config</button>
        </div>

        <h2>🛠️ Available Tools</h2>
        <div class="feature">
            <strong>execute_code</strong> - Execute code in multiple languages with isolated environments
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
        </pre>

        <h2>🔍 API Endpoints</h2>
        <div class="endpoint">GET /health - Server health status</div>
        <div class="endpoint">GET /config/stdio - STDIO configuration JSON</div>

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
            });
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

async function main(): Promise<void> {
  try {
    // Initialize services first
    services = await initializeServices();

    // Create and configure MCP server
    const server = createServer();

    // Graceful shutdown handler
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      
      try {
        if (services) {
          await Promise.all([
            services.sessionManager.cleanup(),
            services.executionManager.cleanup()
          ]);
        }
        
        await server.close();
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

    // Start web interface if in development or web mode
    const useWebInterface = process.env.NODE_ENV === 'development' || process.env.WEB_INTERFACE === 'true';
    if (useWebInterface) {
      const port = parseInt(process.env.PORT || '3000');
      await startWebInterface(port);
      logger.info(`📚 Documentation: http://localhost:${port}`);
    }

    // Start the MCP server
    logger.info('🎉 Starting Opendoor MCP Server with STDIO transport');
    logger.info('🔧 Multi-language code execution environment ready');
    logger.info('🖥️  VS Code integration enabled');
    logger.info('🎭 Playwright browser automation ready');
    
    const transport = new StdioServerTransport();
    await server.connect(transport);

  } catch (error) {
    logger.error('💥 Failed to start server:', error);
    process.exit(1);
  }
}

// Export for testing
export { services };

// Start the server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logger.error('Failed to start server:', error);
    process.exit(1);
  });
}
