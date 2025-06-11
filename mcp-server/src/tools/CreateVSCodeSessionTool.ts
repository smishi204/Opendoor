import { z } from 'zod';
import { ServiceContainer } from '../index.js';
import { SUPPORTED_LANGUAGES } from '../types/McpTypes.js';

const CreateVSCodeSessionSchema = z.object({
  language: z.enum([
    'python', 'javascript', 'typescript', 'java', 'c', 'cpp', 
    'csharp', 'rust', 'go', 'php', 'perl', 'ruby', 'lua', 
    'swift', 'objc'
  ]).optional(),
  template: z.enum(['basic', 'web', 'api', 'data-science', 'machine-learning']).optional(),
  memory: z.enum(['1g', '2g', '4g', '8g']).optional()
});

type CreateVSCodeSessionInput = z.infer<typeof CreateVSCodeSessionSchema>;

export const createVSCodeSessionTool = {
  definition: {
    name: "create_vscode_session",
    description: "Create an isolated VS Code development environment with full IDE capabilities",
    inputSchema: {
      type: "object",
      properties: {
        language: {
          type: "string",
          enum: [
            'python', 'javascript', 'typescript', 'java', 'c', 'cpp', 
            'csharp', 'rust', 'go', 'php', 'perl', 'ruby', 'lua', 
            'swift', 'objc'
          ],
          description: "Primary programming language for the development environment"
        },
        template: {
          type: "string",
          enum: ['basic', 'web', 'api', 'data-science', 'machine-learning'],
          description: "Project template to initialize the environment with"
        },
        memory: {
          type: "string",
          enum: ['1g', '2g', '4g', '8g'],
          description: "Memory allocation for the container (default: 4g)"
        }
      },
      required: []
    }
  },

  async execute(input: unknown, services: ServiceContainer) {
    // Validate input
    const validInput = CreateVSCodeSessionSchema.parse(input);
    const { language = 'python', template = 'basic', memory = '4g' } = validInput;

    // Validate language if provided
    if (language && !SUPPORTED_LANGUAGES[language]) {
      throw new Error(`Unsupported language: ${language}. Supported languages: ${Object.keys(SUPPORTED_LANGUAGES).join(', ')}`);
    }

    try {
      // Create VS Code session
      const session = await services.sessionManager.createSession({
        type: 'vscode',
        language,
        memory,
        clientId: 'vscode_tool',
        template
      });

      // Create the VS Code session in the execution manager
      await services.executionManager.createVSCodeSession(session.id, language);

      // Get VS Code URL
      const vscodeUrl = await services.executionManager.getVSCodeUrl(session.id);

      return {
        content: [
          {
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
          }
        ]
      };

    } catch (error) {
      throw new Error(`Failed to create VS Code session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
};
