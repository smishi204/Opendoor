import { MCPTool } from '@ronangrant/mcp-framework';
import { z } from 'zod';
import { globalServices } from '../index.js';
import { Session } from '../types/McpTypes.js';

interface ManageSessionsInput {
  action: 'list' | 'get' | 'destroy';
  sessionId?: string;
}

export default class ManageSessionsTool extends MCPTool<ManageSessionsInput> {
  name = "manage_sessions";
  description = "List, inspect, or destroy development sessions";

  protected schema = {
    action: {
      type: z.enum(['list', 'get', 'destroy']),
      description: "Action to perform: list all sessions, get specific session details, or destroy a session"
    },
    sessionId: {
      type: z.string().optional(),
      description: "Session ID (required for 'get' and 'destroy' actions)"
    }
  };

  protected async execute(input: ManageSessionsInput) {
    if (!globalServices) {
      throw new Error('Services not initialized');
    }

    const { action, sessionId } = input;

    try {
      switch (action) {
        case 'list':
          return await this.listSessions();
        
        case 'get':
          if (!sessionId) {
            throw new Error('Session ID is required for get action');
          }
          return await this.getSession(sessionId);
        
        case 'destroy':
          if (!sessionId) {
            throw new Error('Session ID is required for destroy action');
          }
          return await this.destroySession(sessionId);
        
        default:
          throw new Error(`Unknown action: ${action}`);
      }
    } catch (error) {
      throw new Error(`Session management failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async listSessions() {
    const sessions = await globalServices!.sessionManager.listSessions('session_tool');
    
    if (sessions.length === 0) {
      return this.createSuccessResponse({
        type: "text",
        text: "**No Active Sessions**\n\nThere are currently no active development sessions."
      });
    }

    const sessionList = sessions.map((session: Session) => {
      const uptime = Date.now() - session.createdAt.getTime();
      const uptimeStr = this.formatUptime(uptime);
      
      return `**${session.id}**
- **Type:** ${session.type}
- **Language:** ${session.language || 'N/A'}
- **Status:** ${session.status}
- **Memory:** ${session.memory}
- **Uptime:** ${uptimeStr}
- **Last Accessed:** ${this.formatTime(session.lastAccessedAt)}
- **Endpoints:** ${Object.keys(session.endpoints).join(', ') || 'None'}`;
    }).join('\n\n');

    return this.createSuccessResponse({
      type: "text",
      text: `**Active Sessions (${sessions.length})**\n\n${sessionList}`
    });
  }

  private async getSession(sessionId: string) {
    const session = await globalServices!.sessionManager.getSession(sessionId);
    
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const uptime = Date.now() - session.createdAt.getTime();
    const uptimeStr = this.formatUptime(uptime);

    const endpoints = Object.entries(session.endpoints)
      .map(([key, url]) => `- **${key}:** ${url}`)
      .join('\n') || 'None';

    return this.createSuccessResponse({
      type: "text",
      text: `**Session Details: ${sessionId}**

**Basic Information:**
- **Type:** ${session.type}
- **Language:** ${session.language || 'N/A'}
- **Status:** ${session.status}
- **Memory Allocation:** ${session.memory}
- **Container ID:** ${session.containerId || 'Not assigned'}

**Timing Information:**
- **Created:** ${this.formatTime(session.createdAt)}
- **Last Accessed:** ${this.formatTime(session.lastAccessedAt)}
- **Uptime:** ${uptimeStr}

**Available Endpoints:**
${endpoints}

**Client Information:**
- **Client ID:** ${session.clientId}`
    });
  }

  private async destroySession(sessionId: string) {
    // Check if session exists first
    const session = await globalServices!.sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Destroy the session in both managers
    await globalServices!.containerManager.destroySession(sessionId);
    await globalServices!.sessionManager.destroySession(sessionId);

    return this.createSuccessResponse({
      type: "text",
      text: `**Session Destroyed Successfully**

Session **${sessionId}** (${session.type}) has been destroyed and all associated resources have been cleaned up.

**Destroyed Session Details:**
- **Type:** ${session.type}
- **Language:** ${session.language || 'N/A'}
- **Uptime:** ${this.formatUptime(Date.now() - session.createdAt.getTime())}
- **Container:** ${session.containerId || 'None'}`
    });
  }

  private formatUptime(milliseconds: number): string {
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

  private formatTime(date: Date): string {
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
}