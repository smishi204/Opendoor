#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
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
          command: "node",
          args: ["dist/index.js"]
        }
      }
    });
  });

  // SSE endpoint for MCP transport
  app.get('/sse', (req, res) => {
    if (!services) {
      return res.status(503).json({ error: 'Services not initialized' });
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Cache-Control');

    // Create SSE transport for this connection
    const sseTransport = new SSEServerTransport('/sse', res);
    
    // Create a new server instance for this SSE connection
    const sseServer = createServer();
    
    // Connect the server to the SSE transport
    sseServer.connect(sseTransport).catch((error) => {
      logger.error('SSE connection error:', error);
      res.end();
    });

    // Handle client disconnect
    req.on('close', () => {
      logger.debug('SSE client disconnected');
      sseServer.close().catch(console.error);
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
        command: "node",
        args: ["dist/index.js"]
      }
    }
  };

  const sseConfig = {
    mcpServers: {
      "opendoor": {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/client-sse"],
        env: {
          MCP_SERVER_URL: `${baseUrl}/sse`
        }
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
            <p>For local development and testing:</p>
            <pre id="stdio-config">${JSON.stringify(stdioConfig, null, 2)}</pre>
            <button class="copy-btn" onclick="copyToClipboard('stdio-config')">Copy STDIO Config</button>
        </div>

        <div class="config-section">
            <h3>🌐 SSE Configuration</h3>
            <p>For Railway production deployment:</p>
            <pre id="sse-config">${JSON.stringify(sseConfig, null, 2)}</pre>
            <button class="copy-btn" onclick="copyToClipboard('sse-config')">Copy SSE Config</button>
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
            <span class="badge">MANAGEMENT</span>
        </div>
        <div class="feature">
            <strong>system_health</strong> - Monitor system resources and service health
            <span class="badge">MONITORING</span>
        </div>

        <h2>🌐 Supported Languages & Virtual Environments</h2>
        <table class="spec-table">
            <thead>
                <tr>
                    <th>Language</th>
                    <th>Runtime</th>
                    <th>Package Manager</th>
                    <th>Isolation</th>
                </tr>
            </thead>
            <tbody>
                <tr><td>Python</td><td>Python 3.x</td><td>pip (isolated venv)</td><td>✅ Virtual Environment</td></tr>
                <tr><td>JavaScript</td><td>Node.js</td><td>npm (isolated)</td><td>✅ Project Environment</td></tr>
                <tr><td>TypeScript</td><td>Node.js + TypeScript</td><td>npm (isolated)</td><td>✅ Project Environment</td></tr>
                <tr><td>Java</td><td>OpenJDK</td><td>Maven/Gradle</td><td>✅ Classpath Isolation</td></tr>
                <tr><td>Rust</td><td>Rust + Cargo</td><td>Cargo (isolated)</td><td>✅ CARGO_HOME</td></tr>
                <tr><td>Go</td><td>Go Modules</td><td>go mod (isolated)</td><td>✅ GOPATH Isolation</td></tr>
                <tr><td>C/C++</td><td>GCC/G++</td><td>Build system</td><td>✅ Build Directory</td></tr>
                <tr><td>PHP</td><td>PHP + Composer</td><td>Composer (isolated)</td><td>✅ Project Environment</td></tr>
                <tr><td>Ruby</td><td>Ruby + Bundler</td><td>Bundler (isolated)</td><td>✅ Gem Environment</td></tr>
                <tr><td>C#</td><td>.NET Core</td><td>NuGet</td><td>✅ Project Environment</td></tr>
            </tbody>
        </table>

        <h2>🔒 Security Features</h2>
        <div class="feature">
            <strong>Process Isolation</strong> - Each execution runs in isolated processes
        </div>
        <div class="feature">
            <strong>Virtual Environment Isolation</strong> - Language-specific dependency isolation
        </div>
        <div class="feature">
            <strong>Resource Limits</strong> - Memory and CPU usage controls
        </div>
        <div class="feature">
            <strong>Execution Timeouts</strong> - Prevent runaway processes
        </div>
        <div class="feature">
            <strong>Code Validation</strong> - Security pattern detection
        </div>

        <h2>📊 System Status</h2>
        <div id="status">Loading...</div>

        <h2>🔍 API Endpoints</h2>
        <div class="endpoint">GET /health - Server health status and metrics</div>
        <div class="endpoint">GET /config/stdio - STDIO configuration for MCP clients</div>
        <div class="endpoint">GET /sse - SSE transport endpoint for Railway deployment</div>

        <h2>🚀 Railway Deployment</h2>
        <div class="highlight">
            <h3>Production Deployment Instructions</h3>
            <ol>
                <li>Deploy this repository to Railway</li>
                <li>Set environment variables as needed</li>
                <li>Use the SSE configuration above in your MCP client</li>
                <li>The server automatically sets up isolated environments for all languages</li>
            </ol>
        </div>
    </div>

    <script>
        function copyToClipboard(elementId) {
            const element = document.getElementById(elementId);
            const text = element.textContent;
            navigator.clipboard.writeText(text).then(() => {
                const btn = element.nextElementSibling;
                const originalText = btn.textContent;
                btn.textContent = 'Copied!';
                btn.style.background = 'linear-gradient(145deg, #27ae60, #229954)';
                setTimeout(() => {
                    btn.textContent = originalText;
                    btn.style.background = 'linear-gradient(145deg, #3498db, #2980b9)';
                }, 2000);
            });
        }

        // Load system status
        fetch('/health')
            .then(response => response.json())
            .then(data => {
                const services = Object.entries(data.services || {})
                    .map(([key, value]) => \`<span class="badge">\${key}: \${typeof value === 'object' ? value.status : value}</span>\`)
                    .join(' ');
                
                document.getElementById('status').innerHTML = \`
                    <div class="feature">
                        <strong>Status:</strong> <span class="status healthy">\${data.status}</span><br>
                        <strong>Uptime:</strong> \${Math.floor(data.uptime || 0)}s<br>
                        <strong>Memory:</strong> \${Math.round((data.memory?.rss || 0) / 1024 / 1024)}MB<br>
                        <strong>Services:</strong> \${services}
                    </div>
                \`;
            })
            .catch(() => {
                document.getElementById('status').innerHTML = \`
                    <div class="feature">
                        <strong>Status:</strong> <span class="status">Unable to fetch</span>
                    </div>
                \`;
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

    // Start web interface if in development, web mode, or Railway deployment
    const isRailwayDeployment = process.env.RAILWAY_ENVIRONMENT || process.env.PORT;
    const useWebInterface = process.env.NODE_ENV === 'development' || 
                           process.env.WEB_INTERFACE === 'true' || 
                           isRailwayDeployment;
    
    if (useWebInterface) {
      const port = parseInt(process.env.PORT || '3000');
      await startWebInterface(port);
      logger.info(`📚 Web interface started on port ${port}`);
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
