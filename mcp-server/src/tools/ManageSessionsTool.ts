import { z } from 'zod';
import { ServiceContainer } from '../index.js';
import { Session } from '../types/McpTypes.js';

const ManageSessionsSchema = z.object({
  action: z.enum(['list', 'get', 'destroy']),
  sessionId: z.string().optional()
});

type ManageSessionsInput = z.infer<typeof ManageSessionsSchema>;

export const manageSessionsTool = {
  definition: {
    name: "manage_sessions",
    description: "List, inspect, or destroy development sessions",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ['list', 'get', 'destroy'],
          description: "Action to perform: list all sessions, get specific session details, or destroy a session"
        },
        sessionId: {
          type: "string",
          description: "Session ID (required for 'get' and 'destroy' actions)"
        }
      },
      required: ["action"]
    }
  },

  async execute(input: unknown, services: ServiceContainer) {
    // Validate input
    const validInput = ManageSessionsSchema.parse(input);
    const { action, sessionId } = validInput;

    try {
      switch (action) {
        case 'list':
          return await listSessions(services);
        
        case 'get':
          if (!sessionId) {
            throw new Error('Session ID is required for get action');
          }
          return await getSession(sessionId, services);
        
        case 'destroy':
          if (!sessionId) {
            throw new Error('Session ID is required for destroy action');
          }
          return await destroySession(sessionId, services);
        
        default:
          throw new Error(`Unknown action: ${action}`);
      }
    } catch (error) {
      throw new Error(`Session management failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
};

async function listSessions(services: ServiceContainer) {
  const sessions = await services.sessionManager.listSessions('session_tool');
  
  if (sessions.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: "**No Active Sessions**\n\nThere are currently no active development sessions."
        }
      ]
    };
  }

  const sessionList = sessions.map((session: Session) => {
    const uptime = Date.now() - session.createdAt.getTime();
    const uptimeStr = formatUptime(uptime);
    
    return `**${session.id}**
- **Type:** ${session.type}
- **Language:** ${session.language || 'N/A'}
- **Status:** ${session.status}
- **Memory:** ${session.memory}
- **Uptime:** ${uptimeStr}
- **Last Accessed:** ${formatTime(session.lastAccessedAt)}
- **Endpoints:** ${Object.keys(session.endpoints).join(', ') || 'None'}`;
  }).join('\n\n');

  return {
    content: [
      {
        type: "text",
        text: `**Active Sessions (${sessions.length})**\n\n${sessionList}`
      }
    ]
  };
}

async function getSession(sessionId: string, services: ServiceContainer) {
  const session = await services.sessionManager.getSession(sessionId);
  
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  const uptime = Date.now() - session.createdAt.getTime();
  const uptimeStr = formatUptime(uptime);

  const endpoints = Object.entries(session.endpoints)
    .map(([key, url]) => `- **${key}:** ${url}`)
    .join('\n') || 'None';

  return {
    content: [
      {
        type: "text",
        text: `**Session Details: ${sessionId}**

**Basic Information:**
- **Type:** ${session.type}
- **Language:** ${session.language || 'N/A'}
- **Status:** ${session.status}
- **Memory Allocation:** ${session.memory}
- **Container ID:** ${session.containerId || 'Not assigned'}

**Timing Information:**
- **Created:** ${formatTime(session.createdAt)}
- **Last Accessed:** ${formatTime(session.lastAccessedAt)}
- **Uptime:** ${uptimeStr}

**Available Endpoints:**
${endpoints}

**Client Information:**
- **Client ID:** ${session.clientId}`
      }
    ]
  };
}

async function destroySession(sessionId: string, services: ServiceContainer) {
  // Check if session exists first
  const session = await services.sessionManager.getSession(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  // Destroy the session in both managers
  await services.executionManager.destroySession(sessionId);
  await services.sessionManager.destroySession(sessionId);

  return {
    content: [
      {
        type: "text",
        text: `**Session Destroyed Successfully**

Session **${sessionId}** (${session.type}) has been destroyed and all associated resources have been cleaned up.

**Destroyed Session Details:**
- **Type:** ${session.type}
- **Language:** ${session.language || 'N/A'}
- **Uptime:** ${formatUptime(Date.now() - session.createdAt.getTime())}
- **Container:** ${session.containerId || 'None'}`
      }
    ]
  };
}

function formatUptime(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

function formatTime(date: Date): string {
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short'
  });
}
