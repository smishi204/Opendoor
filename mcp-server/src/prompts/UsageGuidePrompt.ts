import { z } from 'zod';

const UsageGuideSchema = z.object({
  topic: z.enum(['overview', 'code_execution', 'vscode', 'playwright', 'sessions', 'security']).optional(),
  language: z.string().optional()
});

type UsageGuideInput = z.infer<typeof UsageGuideSchema>;

export const usageGuidePrompt = {
  definition: {
    name: "usage_guide",
    description: "Get comprehensive usage instructions for the Opendoor MCP Server",
    arguments: [
      {
        name: "topic",
        description: "Specific topic to get guidance on (default: overview)",
        required: false
      },
      {
        name: "language", 
        description: "Programming language for language-specific examples",
        required: false
      }
    ]
  },

  async execute(input: unknown) {
    // Validate input
    const validInput = UsageGuideSchema.parse(input);
    const { topic = 'overview', language = 'python' } = validInput;

    const guides = {
      overview: getOverviewGuide(),
      code_execution: getCodeExecutionGuide(language),
      vscode: getVSCodeGuide(language),
      playwright: getPlaywrightGuide(),
      sessions: getSessionGuide(),
      security: getSecurityGuide()
    };

    const guide = guides[topic as keyof typeof guides] || guides.overview;

    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Please provide a comprehensive guide for: ${topic}`
          }
        },
        {
          role: "assistant",
          content: {
            type: "text",
            text: guide
          }
        }
      ]
    };
  }
};

function getOverviewGuide(): string {
  return `# Opendoor MCP Server - Complete Usage Guide

## Overview
The Opendoor MCP Server is a production-ready Model Context Protocol server that provides isolated, containerized development environments with support for multiple programming languages, VS Code integration, and browser automation.

## Key Features
- **Multi-language Code Execution**: Support for 15+ programming languages
- **VS Code Integration**: Full IDE environments in containers
- **Playwright Browser Automation**: Web testing and scraping capabilities
- **Session Management**: Persistent development environments
- **Security**: Container isolation and resource controls

## Available Tools
1. **execute_code** - Run code in isolated containers
2. **create_vscode_session** - Launch VS Code development environments
3. **create_playwright_session** - Set up browser automation environments
4. **manage_sessions** - List, inspect, and destroy sessions
5. **system_health** - Check server health and status

## Quick Start
1. Use \`execute_code\` for quick code execution
2. Use \`create_vscode_session\` for development projects
3. Use \`create_playwright_session\` for web automation
4. Use \`manage_sessions\` to track your environments
5. Use \`system_health\` to monitor the system

## Supported Languages
Python, JavaScript, TypeScript, Java, C, C++, C#, Rust, Go, PHP, Perl, Ruby, Lua, Swift, Objective-C

## Next Steps
- Try executing some code with \`execute_code\`
- Create a development environment with \`create_vscode_session\`
- Explore browser automation with \`create_playwright_session\`

For specific guidance, ask for help with topics: code_execution, vscode, playwright, sessions, or security.`;
}

function getCodeExecutionGuide(language: string): string {
  const examples = {
    python: `# Python example
print("Hello from Python!")
import requests
response = requests.get("https://httpbin.org/json")
print(response.json())`,
    
    javascript: `// JavaScript example
console.log("Hello from JavaScript!");
import fs from 'fs';
console.log("Current directory:", process.cwd());`,
    
    typescript: `// TypeScript example
interface User {
  name: string;
  age: number;
}

const user: User = { name: "Alice", age: 30 };
console.log(\`Hello \${user.name}, you are \${user.age} years old!\`);`,
    
    java: `// Java example
public class HelloWorld {
    public static void main(String[] args) {
        System.out.println("Hello from Java!");
        System.out.println("Java version: " + System.getProperty("java.version"));
    }
}`,
    
    go: `// Go example
package main

import (
    "fmt"
    "runtime"
)

func main() {
    fmt.Println("Hello from Go!")
    fmt.Printf("Go version: %s\\n", runtime.Version())
}`
  };

  const example = examples[language as keyof typeof examples] || examples.python;

  return `# Code Execution Guide

## Overview
The \`execute_code\` tool allows you to run code in isolated, secure containers with support for 15+ programming languages.

## Basic Usage
\`\`\`json
{
  "language": "${language}",
  "code": "print('Hello World!')"
}
\`\`\`

## Advanced Options
- **sessionId**: Execute in an existing session for persistence
- **timeout**: Set execution timeout (1s to 5min, default: 30s)
- **stdin**: Provide input to the program

## Example: ${language.charAt(0).toUpperCase() + language.slice(1)}
\`\`\`${language}
${example}
\`\`\`

## Session-based Execution
1. Create a session: \`create_vscode_session\` or use \`execute_code\` without sessionId
2. Use the session ID for subsequent executions to maintain state
3. Files and variables persist within the session

## Best Practices
- Use sessions for multi-step workflows
- Set appropriate timeouts for long-running code
- Handle errors gracefully in your code
- Use stdin for interactive programs

## Security Features
- Code runs in isolated Docker containers
- No internet access by default
- Limited filesystem access
- Resource quotas enforced
- Automatic cleanup after execution

## Troubleshooting
- Check syntax errors in the output
- Verify language-specific requirements
- Use shorter timeouts for testing
- Check session status if using persistent sessions`;
}

function getVSCodeGuide(language: string): string {
  return `# VS Code Development Environment Guide

## Overview
Create full-featured VS Code development environments running in isolated containers with language-specific tooling and extensions.

## Creating a VS Code Session
\`\`\`json
{
  "language": "${language}",
  "template": "basic",
  "memory": "4g"
}
\`\`\`

## Available Templates
- **basic**: Minimal setup with language runtime
- **web**: Web development with common frameworks
- **api**: API development with testing tools
- **data-science**: Data analysis and ML libraries
- **machine-learning**: ML frameworks and notebooks

## Memory Options
- **1g**: Light development
- **2g**: Standard development
- **4g**: Heavy development (default)
- **8g**: Resource-intensive projects

## Features
- Full VS Code interface in browser
- Integrated terminal
- File explorer and editor
- Extension marketplace
- Git integration
- Debugging support
- Port forwarding for web apps

## Workflow
1. Create VS Code session
2. Access via the provided URL
3. Use integrated terminal for commands
4. Edit files in the browser-based editor
5. Run and debug your applications
6. Access forwarded ports for web apps

## Language-Specific Features
### ${language.charAt(0).toUpperCase() + language.slice(1)}
- Syntax highlighting and IntelliSense
- Integrated debugger
- Package manager integration
- Linting and formatting
- Testing framework support

## Tips
- Wait 30-60 seconds for full initialization
- Use Ctrl+\` to open integrated terminal
- Install extensions from the marketplace
- Use port forwarding for web applications
- Save work frequently (auto-save enabled)

## Session Management
- Sessions persist until manually destroyed
- Use \`manage_sessions\` to track active sessions
- Clean up unused sessions to free resources
- Sessions include all installed packages and files`;
}

function getPlaywrightGuide(): string {
  return `# Playwright Browser Automation Guide

## Overview
Create browser automation environments with Playwright for web testing, scraping, and UI automation.

## Creating a Playwright Session
\`\`\`json
{
  "browser": "chromium",
  "headless": true,
  "viewport": {"width": 1920, "height": 1080},
  "memory": "4g"
}
\`\`\`

## Browser Options
- **chromium**: Google Chrome engine (default)
- **firefox**: Mozilla Firefox engine
- **webkit**: Safari engine

## Configuration
- **headless**: Run without GUI (true/false)
- **viewport**: Browser window size
- **memory**: Container memory allocation

## Common Playwright Operations

### Navigation
\`\`\`javascript
await page.goto('https://example.com');
await page.goBack();
await page.goForward();
await page.reload();
\`\`\`

### Element Interaction
\`\`\`javascript
await page.click('button[type="submit"]');
await page.fill('input[name="email"]', 'test@example.com');
await page.selectOption('select', 'option-value');
await page.check('input[type="checkbox"]');
\`\`\`

### Data Extraction
\`\`\`javascript
const title = await page.textContent('h1');
const links = await page.$$eval('a', els => els.map(el => el.href));
const screenshot = await page.screenshot();
\`\`\`

### Waiting and Assertions
\`\`\`javascript
await page.waitForSelector('.loading', { state: 'hidden' });
await page.waitForURL('**/dashboard');
await expect(page.locator('h1')).toHaveText('Welcome');
\`\`\`

## Advanced Features
- Network interception and mocking
- Cookie and storage management
- PDF generation
- Mobile device emulation
- Geolocation and permissions
- File uploads and downloads

## Best Practices
- Use explicit waits instead of timeouts
- Leverage Playwright's auto-waiting
- Use data-testid attributes for reliable selectors
- Handle dynamic content properly
- Implement proper error handling

## Example: Web Scraping
\`\`\`javascript
// Navigate to page
await page.goto('https://news.ycombinator.com');

// Extract headlines
const headlines = await page.$$eval('.titleline > a', links => 
  links.map(link => ({
    title: link.textContent,
    url: link.href
  }))
);

console.log('Top headlines:', headlines.slice(0, 5));
\`\`\`

## Session Management
- Browser context persists across executions
- Cookies and storage maintained
- Multiple pages supported
- Clean up sessions when done`;
}

function getSessionGuide(): string {
  return `# Session Management Guide

## Overview
Sessions provide persistent, isolated environments for development work. Each session runs in its own container with dedicated resources.

## Session Types
1. **execution**: Temporary code execution
2. **vscode**: Full development environment
3. **playwright**: Browser automation environment

## Managing Sessions

### List All Sessions
\`\`\`json
{
  "action": "list"
}
\`\`\`

### Get Session Details
\`\`\`json
{
  "action": "get",
  "sessionId": "session_123"
}
\`\`\`

### Destroy Session
\`\`\`json
{
  "action": "destroy",
  "sessionId": "session_123"
}
\`\`\`

## Session Lifecycle
1. **Creating**: Container is being set up
2. **Running**: Ready for use
3. **Stopped**: Temporarily paused
4. **Error**: Failed to initialize

## Session Information
- **ID**: Unique identifier
- **Type**: execution, vscode, or playwright
- **Language**: Programming language
- **Status**: Current state
- **Memory**: Allocated memory
- **Uptime**: How long it's been running
- **Endpoints**: Access URLs
- **Container ID**: Docker container identifier

## Best Practices
- Create sessions for persistent work
- Use appropriate memory allocation
- Clean up unused sessions
- Monitor session health
- Use descriptive session names when possible

## Resource Management
- Sessions consume system resources
- Memory is allocated per session
- CPU usage scales with activity
- Storage persists within session lifetime
- Network access is controlled

## Troubleshooting
- Check session status if access fails
- Verify endpoints are accessible
- Monitor resource usage
- Review container logs if available
- Restart sessions if they become unresponsive

## Automatic Cleanup
- Idle sessions may be cleaned up
- Failed sessions are automatically removed
- Resource limits are enforced
- Cleanup runs periodically`;
}

function getSecurityGuide(): string {
  return `# Security Guide

## Overview
The Opendoor MCP Server implements multiple layers of security to ensure safe code execution and system protection.

## Container Isolation
- Each session runs in isolated Docker containers
- No access to host filesystem
- Limited network connectivity
- Resource quotas enforced
- Process isolation maintained

## Network Security
- No internet access by default
- Internal network isolation
- Port access controlled
- Traffic monitoring enabled
- Firewall rules applied

## Resource Controls
- Memory limits per container
- CPU usage quotas
- Disk space restrictions
- Process count limits
- Execution timeouts

## Authentication & Authorization
- API key authentication supported
- JWT token validation
- Rate limiting per client
- Request validation
- Access logging

## Code Execution Safety
- Sandboxed environments
- No privileged operations
- File system restrictions
- Package installation controls
- Runtime monitoring

## Data Protection
- Session data isolation
- Temporary file cleanup
- No persistent storage by default
- Secure communication channels
- Audit logging

## Rate Limiting
- 100 requests per minute per client
- Burst protection enabled
- Gradual backoff implemented
- Fair usage policies
- Abuse detection

## Monitoring & Logging
- Security event logging
- Performance monitoring
- Resource usage tracking
- Error reporting
- Health checks

## Best Practices for Users
- Don't include sensitive data in code
- Use environment variables for secrets
- Validate all inputs
- Handle errors gracefully
- Monitor resource usage
- Clean up sessions promptly

## Incident Response
- Automatic threat detection
- Container isolation on suspicious activity
- Logging and alerting
- Graceful degradation
- Recovery procedures

## Compliance
- Industry standard security practices
- Regular security updates
- Vulnerability scanning
- Security audits
- Documentation maintenance

## Reporting Security Issues
- Contact system administrators
- Provide detailed information
- Include reproduction steps
- Respect responsible disclosure
- Follow up on resolution`;
}
