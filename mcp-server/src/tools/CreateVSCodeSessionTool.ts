import { MCPTool } from '@ronangrant/mcp-framework';
import { z } from 'zod';
import { globalServices } from '../index.js';
import { SUPPORTED_LANGUAGES } from '../types/McpTypes.js';

interface CreateVSCodeSessionInput {
  language?: string;
  template?: string;
  memory?: string;
}

export default class CreateVSCodeSessionTool extends MCPTool<CreateVSCodeSessionInput> {
  name = "create_vscode_session";
  description = "Create an isolated VS Code development environment with full IDE capabilities";

  protected schema = {
    language: {
      type: z.enum([
        'python', 'javascript', 'typescript', 'java', 'c', 'cpp', 
        'csharp', 'rust', 'go', 'php', 'perl', 'ruby', 'lua', 
        'swift', 'objc'
      ] as const).optional(),
      description: "Primary programming language for the development environment"
    },
    template: {
      type: z.enum(['basic', 'web', 'api', 'data-science', 'machine-learning']).optional(),
      description: "Project template to initialize the environment with"
    },
    memory: {
      type: z.enum(['1g', '2g', '4g', '8g']).optional(),
      description: "Memory allocation for the container (default: 4g)"
    }
  };

  protected async execute(input: CreateVSCodeSessionInput) {
    if (!globalServices) {
      throw new Error('Services not initialized');
    }

    const { language = 'python', template = 'basic', memory = '4g' } = input;

    // Validate language if provided
    if (language && !SUPPORTED_LANGUAGES[language]) {
      throw new Error(`Unsupported language: ${language}. Supported languages: ${Object.keys(SUPPORTED_LANGUAGES).join(', ')}`);
    }

    try {
      // Create VS Code session
      const session = await globalServices.sessionManager.createSession({
        type: 'vscode',
        language,
        memory,
        clientId: 'vscode_tool',
        template
      });

      // Get VS Code URL
      const vscodeUrl = await globalServices.containerManager.getVSCodeUrl(session.id);

      return this.createSuccessResponse({
        type: "text",
        text: `**VS Code Development Environment Created Successfully!**

**Session Details:**
- **Session ID:** ${session.id}
- **Language:** ${language}
- **Template:** ${template}
- **Memory:** ${memory}
- **Status:** ${session.status}

**Access Information:**
- **VS Code URL:** ${vscodeUrl}
- **Container ID:** ${session.containerId || 'Initializing...'}

**Available Endpoints:**
${Object.entries(session.endpoints).map(([key, url]) => `- **${key}:** ${url}`).join('\n')}

**Usage Instructions:**
1. Click the VS Code URL to access your development environment
2. The environment comes pre-configured with ${language} support
3. Use the integrated terminal for command-line operations
4. Files are persisted within the session until destroyed
5. Use the session ID for future operations with this environment

**Note:** The environment may take a few moments to fully initialize. If the VS Code interface doesn't load immediately, please wait 30-60 seconds and refresh.`
      });

    } catch (error) {
      throw new Error(`Failed to create VS Code session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}