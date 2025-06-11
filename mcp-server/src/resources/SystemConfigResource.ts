import { ServiceContainer } from '../index.js';
import { SUPPORTED_LANGUAGES } from '../types/McpTypes.js';

export const systemConfigResource = {
  definition: {
    uri: "opendoor://config/system",
    name: "system_config",
    description: "System configuration and capabilities information",
    mimeType: "application/json"
  },

  async read(services: ServiceContainer) {
    try {
      const config = {
        server: {
          name: "Opendoor MCP Server",
          version: "2.0.0",
          description: "Production-ready MCP server with multi-language support and containerized execution",
          capabilities: [
            "Multi-language code execution",
            "VS Code development environments",
            "Playwright browser automation",
            "Session management",
            "Container isolation",
            "Security controls"
          ]
        },
        
        languages: {
          supported: Object.keys(SUPPORTED_LANGUAGES),
          details: SUPPORTED_LANGUAGES
        },
        
        session_types: {
          execution: {
            description: "Temporary code execution environment",
            features: ["Code execution", "File I/O", "Package installation"],
            default_memory: "2g",
            max_timeout: "5m"
          },
          vscode: {
            description: "Full VS Code development environment",
            features: ["IDE interface", "Terminal access", "File management", "Extensions"],
            default_memory: "4g",
            ports: ["VS Code web interface", "Development server ports"]
          },
          playwright: {
            description: "Browser automation environment",
            features: ["Browser control", "Web scraping", "UI testing", "Screenshot capture"],
            default_memory: "4g",
            browsers: ["chromium", "firefox", "webkit"]
          }
        },
        
        container_config: {
          execution_method: "Local processes with isolation",
          memory_options: ["1g", "2g", "4g", "8g"],
          network_isolation: true,
          security_policies: [
            "No internet access by default",
            "Limited filesystem access",
            "Resource quotas enforced",
            "Process isolation"
          ]
        },
        
        endpoints: {
          stdio: {
            description: "Standard MCP protocol over stdio",
            usage: "Direct integration with MCP clients"
          }
        },
        
        security: {
          rate_limiting: {
            enabled: true,
            requests_per_minute: 100
          },
          authentication: {
            supported: ["API Key", "JWT"],
            required: false
          },
          code_validation: {
            enabled: true,
            patterns_checked: "Dangerous code patterns blocked",
            sandboxing: "Isolated execution environments"
          }
        },
        
        performance: {
          boot_time: "< 3 seconds",
          session_creation: "< 10 seconds",
          code_execution: "< 30 seconds default timeout",
          concurrent_sessions: "Limited by system resources"
        },
        
        environment: {
          node_version: process.version,
          platform: process.platform,
          architecture: process.arch,
          uptime: Math.floor(process.uptime()),
          memory_usage: {
            rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
            heap_used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            heap_total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
          }
        }
      };

      return {
        contents: [
          {
            uri: "opendoor://config/system",
            mimeType: "application/json",
            text: JSON.stringify(config, null, 2)
          }
        ]
      };

    } catch (error) {
      throw new Error(`Failed to read system configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
};
