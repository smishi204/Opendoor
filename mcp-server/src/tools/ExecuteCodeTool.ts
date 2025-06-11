import { z } from 'zod';
import { ServiceContainer } from '../index.js';
import { SUPPORTED_LANGUAGES } from '../types/McpTypes.js';

const ExecuteCodeSchema = z.object({
  language: z.enum([
    'python', 'javascript', 'typescript', 'java', 'c', 'cpp', 
    'csharp', 'rust', 'go', 'php', 'perl', 'ruby', 'lua', 
    'swift', 'objc'
  ]),
  code: z.string().min(1),
  sessionId: z.string().optional(),
  timeout: z.number().min(1000).max(300000).optional(),
  stdin: z.string().optional()
});

type ExecuteCodeInput = z.infer<typeof ExecuteCodeSchema>;

export const executeCodeTool = {
  definition: {
    name: "execute_code",
    description: "Execute code in isolated environment with support for multiple programming languages",
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
          description: "Programming language to execute the code in"
        },
        code: {
          type: "string",
          minLength: 1,
          description: "The code to execute"
        },
        sessionId: {
          type: "string",
          description: "Optional session ID to execute code in an existing session"
        },
        timeout: {
          type: "number",
          minimum: 1000,
          maximum: 300000,
          description: "Execution timeout in milliseconds (1s to 5min, default: 30s)"
        },
        stdin: {
          type: "string",
          description: "Optional input to provide to the program via stdin"
        }
      },
      required: ["language", "code"]
    }
  },

  async execute(input: unknown, services: ServiceContainer) {
    // Validate input
    const validInput = ExecuteCodeSchema.parse(input);
    const { language, code, sessionId, timeout = 30000, stdin } = validInput;

    // Validate language support
    if (!SUPPORTED_LANGUAGES[language]) {
      throw new Error(`Unsupported language: ${language}. Supported languages: ${Object.keys(SUPPORTED_LANGUAGES).join(', ')}`);
    }

    // Validate code security
    const securityCheck = services.securityManager.validateCodeExecution(code, language);
    if (!securityCheck.valid) {
      throw new Error(`Security validation failed: ${securityCheck.reason}`);
    }

    try {
      // If no session ID provided, create a temporary execution session
      let actualSessionId = sessionId;
      let isTemporarySession = false;

      if (!sessionId) {
        const session = await services.sessionManager.createSession({
          type: 'execution',
          language,
          memory: '2g',
          clientId: 'execute_code_tool'
        });
        actualSessionId = session.id;
        isTemporarySession = true;
        
        // Create the execution session in the execution manager
        await services.executionManager.createExecutionSession(actualSessionId, language);
      }

      // Execute the code
      const result = await services.executionManager.executeCode(actualSessionId!, {
        code,
        language,
        timeout,
        stdin
      });

      // Clean up temporary session
      if (isTemporarySession && actualSessionId) {
        try {
          await services.executionManager.destroySession(actualSessionId);
          await services.sessionManager.destroySession(actualSessionId);
        } catch (cleanupError) {
          // Log but don't fail the execution
          console.warn(`Failed to cleanup temporary session ${actualSessionId}:`, cleanupError);
        }
      }

      // Format the response
      const output = [];
      
      if (result.stdout) {
        output.push(`**Output:**\n\`\`\`\n${result.stdout}\n\`\`\``);
      }
      
      if (result.stderr) {
        output.push(`**Errors:**\n\`\`\`\n${result.stderr}\n\`\`\``);
      }
      
      output.push(`**Exit Code:** ${result.exitCode}`);
      output.push(`**Execution Time:** ${result.executionTime}ms`);
      
      if (result.memoryUsage) {
        output.push(`**Memory Usage:** ${Math.round(result.memoryUsage / 1024 / 1024)}MB`);
      }

      return {
        content: [
          {
            type: "text",
            text: output.join('\n\n')
          }
        ]
      };

    } catch (error) {
      throw new Error(`Code execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
};
