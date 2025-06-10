import { MCPTool } from '@ronangrant/mcp-framework';
import { z } from 'zod';
import { globalServices } from '../index.js';
import { SUPPORTED_LANGUAGES } from '../types/McpTypes.js';

interface ExecuteCodeInput {
  language: string;
  code: string;
  sessionId?: string;
  timeout?: number;
  stdin?: string;
}

export default class ExecuteCodeTool extends MCPTool<ExecuteCodeInput> {
  name = "execute_code";
  description = "Execute code in isolated container environment with support for multiple programming languages";

  protected schema = {
    language: {
      type: z.enum([
        'python', 'javascript', 'typescript', 'java', 'c', 'cpp', 
        'csharp', 'rust', 'go', 'php', 'perl', 'ruby', 'lua', 
        'swift', 'objc'
      ] as const),
      description: "Programming language to execute the code in"
    },
    code: {
      type: z.string().min(1),
      description: "The code to execute"
    },
    sessionId: {
      type: z.string().optional(),
      description: "Optional session ID to execute code in an existing session"
    },
    timeout: {
      type: z.number().min(1000).max(300000).optional(),
      description: "Execution timeout in milliseconds (1s to 5min, default: 30s)"
    },
    stdin: {
      type: z.string().optional(),
      description: "Optional input to provide to the program via stdin"
    }
  };

  protected async execute(input: ExecuteCodeInput) {
    if (!globalServices) {
      throw new Error('Services not initialized');
    }

    const { language, code, sessionId, timeout = 30000, stdin } = input;

    // Validate language support
    if (!SUPPORTED_LANGUAGES[language]) {
      throw new Error(`Unsupported language: ${language}. Supported languages: ${Object.keys(SUPPORTED_LANGUAGES).join(', ')}`);
    }

    try {
      // If no session ID provided, create a temporary execution session
      let actualSessionId = sessionId;
      let isTemporarySession = false;

      if (!sessionId) {
        const session = await globalServices.sessionManager.createSession({
          type: 'execution',
          language,
          memory: '2g',
          clientId: 'execute_code_tool'
        });
        actualSessionId = session.id;
        isTemporarySession = true;
      }

      // Execute the code
      const result = await globalServices.containerManager.executeCode(actualSessionId!, {
        code,
        language,
        timeout,
        stdin
      });

      // Clean up temporary session
      if (isTemporarySession && actualSessionId) {
        try {
          await globalServices.sessionManager.destroySession(actualSessionId);
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

      return this.createSuccessResponse({
        type: "text",
        text: output.join('\n\n')
      });

    } catch (error) {
      throw new Error(`Code execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}