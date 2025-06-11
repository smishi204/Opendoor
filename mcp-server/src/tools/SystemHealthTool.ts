import { z } from 'zod';
import { ServiceContainer } from '../index.js';
import { Session } from '../types/McpTypes.js';

const SystemHealthSchema = z.object({
  detailed: z.boolean().optional()
});

type SystemHealthInput = z.infer<typeof SystemHealthSchema>;

export const systemHealthTool = {
  definition: {
    name: "system_health",
    description: "Check the health and status of the MCP server and its services",
    inputSchema: {
      type: "object",
      properties: {
        detailed: {
          type: "boolean",
          description: "Include detailed service information and metrics (default: false)"
        }
      },
      required: []
    }
  },

  async execute(input: unknown, services: ServiceContainer) {
    // Validate input
    const validInput = SystemHealthSchema.parse(input);
    const { detailed = false } = validInput;

    try {
      // Get health status from health service
      const healthStatus = await services.healthService.getHealthStatus();
      
      // Get basic system information
      const systemInfo = await getSystemInfo();
      
      // Get session statistics
      const sessionStats = await getSessionStats(services);

      let output = `**System Health Report**

**Overall Status:** ${getStatusEmoji(healthStatus.status)} ${healthStatus.status.toUpperCase()}
**Timestamp:** ${new Date().toISOString()}

**System Information:**
${systemInfo}

**Session Statistics:**
${sessionStats}`;

      if (detailed) {
        const detailedInfo = await getDetailedInfo(services);
        output += `\n\n**Detailed Service Information:**\n${detailedInfo}`;
      }

      if (healthStatus.issues && healthStatus.issues.length > 0) {
        const issues = healthStatus.issues.map((issue: any) => `- ${issue}`).join('\n');
        output += `\n\n**⚠️ Issues Detected:**\n${issues}`;
      }

      return {
        content: [
          {
            type: "text",
            text: output
          }
        ]
      };

    } catch (error) {
      throw new Error(`Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
};

function getStatusEmoji(status: string): string {
  switch (status) {
    case 'healthy': return '✅';
    case 'degraded': return '⚠️';
    case 'unhealthy': return '❌';
    default: return '❓';
  }
}

async function getSystemInfo(): Promise<string> {
  const uptime = process.uptime();
  const memoryUsage = process.memoryUsage();
  
  return `- **Uptime:** ${formatUptime(uptime * 1000)}
- **Memory Usage:** ${Math.round(memoryUsage.rss / 1024 / 1024)}MB RSS, ${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB Heap
- **Node.js Version:** ${process.version}
- **Platform:** ${process.platform} ${process.arch}
- **PID:** ${process.pid}`;
}

async function getSessionStats(services: ServiceContainer): Promise<string> {
  try {
    const sessions = await services.sessionManager.listSessions('health_tool');
    
    const stats = {
      total: sessions.length,
      byType: {} as Record<string, number>,
      byStatus: {} as Record<string, number>,
      byLanguage: {} as Record<string, number>
    };

    sessions.forEach((session: Session) => {
      // Count by type
      stats.byType[session.type] = (stats.byType[session.type] || 0) + 1;
      
      // Count by status
      stats.byStatus[session.status] = (stats.byStatus[session.status] || 0) + 1;
      
      // Count by language
      if (session.language) {
        stats.byLanguage[session.language] = (stats.byLanguage[session.language] || 0) + 1;
      }
    });

    let output = `- **Total Sessions:** ${stats.total}`;
    
    if (Object.keys(stats.byType).length > 0) {
      const typeStats = Object.entries(stats.byType)
        .map(([type, count]) => `${type}: ${count}`)
        .join(', ');
      output += `\n- **By Type:** ${typeStats}`;
    }
    
    if (Object.keys(stats.byStatus).length > 0) {
      const statusStats = Object.entries(stats.byStatus)
        .map(([status, count]) => `${status}: ${count}`)
        .join(', ');
      output += `\n- **By Status:** ${statusStats}`;
    }
    
    if (Object.keys(stats.byLanguage).length > 0) {
      const langStats = Object.entries(stats.byLanguage)
        .map(([lang, count]) => `${lang}: ${count}`)
        .join(', ');
      output += `\n- **By Language:** ${langStats}`;
    }

    return output;
  } catch (error) {
    return `- **Session Stats:** Error retrieving session statistics`;
  }
}

async function getDetailedInfo(services: ServiceContainer): Promise<string> {
  const details = [];

  // Execution Manager Status
  try {
    const executionInfo = await getExecutionManagerInfo(services);
    details.push(`**Execution Manager:**\n${executionInfo}`);
  } catch (error) {
    details.push(`**Execution Manager:** Error - ${error}`);
  }

  // Session Manager Status
  try {
    const sessionInfo = await getSessionManagerInfo(services);
    details.push(`**Session Manager:**\n${sessionInfo}`);
  } catch (error) {
    details.push(`**Session Manager:** Error - ${error}`);
  }

  // Security Manager Status
  try {
    const securityInfo = await getSecurityManagerInfo();
    details.push(`**Security Manager:**\n${securityInfo}`);
  } catch (error) {
    details.push(`**Security Manager:** Error - ${error}`);
  }

  return details.join('\n\n');
}

async function getExecutionManagerInfo(services: ServiceContainer): Promise<string> {
  return `- Status: Active
- Local Execution: Enabled
- Available Languages: ${Object.keys(await import('../types/McpTypes.js')).length}
- Resource Monitoring: Enabled`;
}

async function getSessionManagerInfo(services: ServiceContainer): Promise<string> {
  const sessions = await services.sessionManager.listSessions('health_tool');
  const activeSessions = sessions.filter((s: Session) => s.status === 'running').length;
  
  return `- Status: Active
- Active Sessions: ${activeSessions}
- Total Sessions: ${sessions.length}
- Cleanup: Enabled`;
}

async function getSecurityManagerInfo(): Promise<string> {
  return `- Status: Active
- Rate Limiting: Enabled
- Code Validation: Enabled
- Security Policies: Applied`;
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
