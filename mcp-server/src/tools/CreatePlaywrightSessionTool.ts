import { z } from 'zod';
import { ServiceContainer } from '../index.js';

const CreatePlaywrightSessionSchema = z.object({
  browser: z.enum(['chromium', 'firefox', 'webkit']).optional(),
  headless: z.boolean().optional(),
  viewport: z.object({
    width: z.number().min(320).max(3840),
    height: z.number().min(240).max(2160)
  }).optional(),
  memory: z.enum(['2g', '4g', '8g']).optional()
});

type CreatePlaywrightSessionInput = z.infer<typeof CreatePlaywrightSessionSchema>;

export const createPlaywrightSessionTool = {
  definition: {
    name: "create_playwright_session",
    description: "Create a browser automation environment with Playwright for web testing and scraping",
    inputSchema: {
      type: "object",
      properties: {
        browser: {
          type: "string",
          enum: ['chromium', 'firefox', 'webkit'],
          description: "Browser engine to use (default: chromium)"
        },
        headless: {
          type: "boolean",
          description: "Run browser in headless mode (default: true)"
        },
        viewport: {
          type: "object",
          properties: {
            width: {
              type: "number",
              minimum: 320,
              maximum: 3840
            },
            height: {
              type: "number",
              minimum: 240,
              maximum: 2160
            }
          },
          description: "Browser viewport size (default: 1920x1080)"
        },
        memory: {
          type: "string",
          enum: ['2g', '4g', '8g'],
          description: "Memory allocation for the container (default: 4g)"
        }
      },
      required: []
    }
  },

  async execute(input: unknown, services: ServiceContainer) {
    // Validate input
    const validInput = CreatePlaywrightSessionSchema.parse(input);
    const { 
      browser = 'chromium', 
      headless = true, 
      viewport = { width: 1920, height: 1080 },
      memory = '4g' 
    } = validInput;

    try {
      // Create session for Playwright
      const session = await services.sessionManager.createSession({
        type: 'playwright',
        language: 'javascript', // Playwright uses JavaScript/TypeScript
        memory,
        clientId: 'playwright_tool'
      });

      // Create Playwright session with specific configuration
      const playwrightSession = await services.executionManager.createPlaywrightSession(session.id, {
        browser,
        headless,
        viewport
      });

      return {
        content: [
          {
            type: "text",
            text: `**Playwright Browser Automation Environment Created Successfully!**

**Session Details:**
- **Session ID:** ${session.id}
- **Browser:** ${browser}
- **Headless Mode:** ${headless ? 'Enabled' : 'Disabled'}
- **Viewport:** ${viewport.width}x${viewport.height}
- **Memory:** ${memory}
- **Status:** ${session.status}

**Playwright Session Info:**
- **Browser Context ID:** ${playwrightSession.contextId || 'Initializing...'}
- **Page URL:** ${playwrightSession.pageUrl || 'about:blank'}

**Available Endpoints:**
${Object.entries(session.endpoints).map(([key, url]) => `- **${key}:** ${url}`).join('\n')}

**Usage Instructions:**
1. Use the session ID to execute Playwright scripts
2. The browser context is pre-configured and ready for automation
3. Supported operations include:
   - Page navigation and interaction
   - Element selection and manipulation
   - Screenshot capture
   - PDF generation
   - Network monitoring
   - Cookie and storage management

**Example Playwright Script:**
\`\`\`javascript
// Navigate to a page
await page.goto('https://example.com');

// Take a screenshot
await page.screenshot({ path: 'screenshot.png' });

// Interact with elements
await page.click('button[type="submit"]');
await page.fill('input[name="email"]', 'test@example.com');

// Extract data
const title = await page.textContent('h1');
console.log('Page title:', title);
\`\`\`

**Note:** The browser environment may take a few moments to fully initialize. Use the execute_code tool with this session ID to run Playwright automation scripts.`
          }
        ]
      };

    } catch (error) {
      throw new Error(`Failed to create Playwright session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
};
