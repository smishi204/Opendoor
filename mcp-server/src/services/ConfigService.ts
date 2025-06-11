import { Logger } from '../utils/Logger.js';
import { SUPPORTED_LANGUAGES } from '../types/McpTypes.js';

export class ConfigService {
  private logger = Logger.getInstance();
  private baseUrl: string;

  constructor() {
    this.baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  }

  async getPublicConfig(): Promise<any> {
    return {
      name: "Opendoor MCP Server",
      description: "Production-ready MCP server for multi-language code execution, VS Code environments, and browser automation",
      target_audience: "Large Language Models (LLMs) via MCP protocol",
      capabilities: {
        code_execution: {
          languages: Object.keys(SUPPORTED_LANGUAGES),
          memory_per_session: "Up to 8GB",
          isolation: "Process isolation with security controls"
        },
        development_environments: {
          vscode_sessions: "Full web IDE with extensions",
          memory_per_session: "Up to 8GB",
          features: ["git", "terminal", "debugger", "extensions"]
        },
        browser_automation: {
          playwright_sessions: "Programmatic browser control",
          browsers: ["chromium", "firefox", "webkit"],
          memory_per_session: "Up to 8GB",
          features: ["screenshots", "pdf_generation", "network_interception"]
        },
        security: {
          code_validation: true,
          process_isolation: true,
          resource_limits: true,
          rate_limiting: true
        }
      },
      tools: await this.getAvailableTools(),
      endpoints: {
        base: this.baseUrl,
        stdio: "MCP STDIO transport",
        health: `${this.baseUrl}/health`,
        config: `${this.baseUrl}/config/stdio`
      },
      usage_note: "This server is designed for LLM programmatic access via the MCP protocol."
    };
  }

  async getClientConfig(): Promise<any> {
    return {
      server_info: {
        name: "Opendoor MCP Server",
        version: "2.0.0",
        description: "Production-grade MCP server for programmatic code execution, VS Code environments, and browser automation",
        target: "Large Language Models (LLMs) - MCP protocol access"
      },
      capabilities: {
        code_execution: {
          enabled: true,
          languages: Object.keys(SUPPORTED_LANGUAGES).length,
          isolation: "process_isolation"
        },
        vscode_environments: {
          enabled: true,
          features: ["web_ide", "extensions", "git", "terminal", "debugger"]
        },
        browser_automation: {
          enabled: true,
          engines: ["chromium", "firefox", "webkit"],
          capabilities: ["screenshots", "pdf_generation", "automation"]
        }
      },
      resources: {
        memory_per_session: "1g-8g configurable",
        cpu_per_session: "Shared CPU allocation",
        process_isolation: true,
        filesystem_isolation: true,
        concurrent_sessions: "Limited by system resources"
      },
      supported_languages: SUPPORTED_LANGUAGES,
      access_methods: {
        stdio: "MCP Standard I/O transport for direct LLM integration"
      },
      usage_model: "LLMs connect via MCP protocol to execute code, manage development environments, and control browsers"
    };
  }

  private async getAvailableTools(): Promise<any[]> {
    return [
      {
        name: "execute_code",
        description: "Execute code in isolated environment with support for 15+ programming languages",
        input_schema: {
          type: "object",
          properties: {
            language: {
              type: "string",
              enum: Object.keys(SUPPORTED_LANGUAGES),
              description: "Programming language to execute"
            },
            code: {
              type: "string",
              description: "Code to execute"
            },
            session_id: {
              type: "string",
              description: "Optional session ID to reuse existing environment",
              optional: true
            },
            timeout: {
              type: "number",
              description: "Execution timeout in milliseconds (default: 30000)",
              optional: true,
              default: 30000
            },
            stdin: {
              type: "string",
              description: "Optional input to provide via stdin",
              optional: true
            }
          },
          required: ["language", "code"]
        }
      },
      {
        name: "create_vscode_session",
        description: "Create isolated VS Code development environment",
        input_schema: {
          type: "object",
          properties: {
            language: {
              type: "string",
              enum: Object.keys(SUPPORTED_LANGUAGES),
              description: "Primary programming language for development",
              optional: true
            },
            template: {
              type: "string",
              enum: ["basic", "web", "api", "data-science", "machine-learning"],
              description: "Project template to initialize",
              optional: true
            },
            memory: {
              type: "string",
              enum: ["1g", "2g", "4g", "8g"],
              description: "Memory allocation (default: 4g)",
              optional: true
            }
          }
        }
      },
      {
        name: "create_playwright_session",
        description: "Create browser automation environment with Playwright",
        input_schema: {
          type: "object",
          properties: {
            browser: {
              type: "string",
              enum: ["chromium", "firefox", "webkit"],
              description: "Browser engine to use",
              default: "chromium"
            },
            headless: {
              type: "boolean",
              description: "Run browser in headless mode",
              default: true
            },
            viewport: {
              type: "object",
              properties: {
                width: { type: "number", default: 1920 },
                height: { type: "number", default: 1080 }
              },
              description: "Browser viewport size",
              optional: true
            },
            memory: {
              type: "string",
              enum: ["2g", "4g", "8g"],
              description: "Memory allocation (default: 4g)",
              optional: true
            }
          }
        }
      },
      {
        name: "manage_sessions",
        description: "List, inspect, or destroy development sessions",
        input_schema: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["list", "get", "destroy"],
              description: "Action to perform"
            },
            session_id: {
              type: "string",
              description: "Session ID (required for get/destroy actions)",
              optional: true
            }
          },
          required: ["action"]
        }
      },
      {
        name: "system_health",
        description: "Check server health and system status",
        input_schema: {
          type: "object",
          properties: {
            detailed: {
              type: "boolean",
              description: "Include detailed metrics and service information",
              optional: true,
              default: false
            }
          }
        }
      }
    ];
  }

  getEnvironmentConfig(): any {
    return {
      node_env: process.env.NODE_ENV || 'development',
      log_level: process.env.LOG_LEVEL || 'info',
      max_sessions_per_client: parseInt(process.env.MAX_SESSIONS_PER_CLIENT || '10'),
      session_timeout_hours: parseInt(process.env.SESSION_TIMEOUT_HOURS || '24'),
      cleanup_interval_minutes: parseInt(process.env.CLEANUP_INTERVAL_MINUTES || '60'),
      web_interface: process.env.WEB_INTERFACE === 'true' || process.env.NODE_ENV === 'development'
    };
  }
}
