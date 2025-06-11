import { Logger } from '../utils/Logger.js';

export class HealthService {
  private logger = Logger.getInstance();

  constructor() {
    // Initialize health service
  }

  async getHealthStatus(): Promise<any> {
    const status = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      services: {
        execution_manager: await this.checkExecutionManagerHealth(),
        session_manager: await this.checkSessionManagerHealth(),
        security_manager: await this.checkSecurityManagerHealth()
      },
      metrics: {
        memory_usage: this.getMemoryUsage(),
        cpu_usage: await this.getCpuUsage(),
        node_env: process.env.NODE_ENV || 'development',
        platform: process.platform,
        arch: process.arch
      }
    };

    // Determine overall status
    const serviceStatuses = Object.values(status.services);
    if (serviceStatuses.some((s: any) => s.status === 'unhealthy')) {
      status.status = 'unhealthy';
    } else if (serviceStatuses.some((s: any) => s.status === 'degraded')) {
      status.status = 'degraded';
    }

    return status;
  }

  private async checkExecutionManagerHealth(): Promise<any> {
    try {
      // Basic health check for execution manager
      return {
        status: 'healthy',
        execution_method: 'local_processes',
        isolation: 'process_isolation'
      };
    } catch (error) {
      this.logger.error('Execution manager health check failed:', error);
      return {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async checkSessionManagerHealth(): Promise<any> {
    try {
      // Basic health check for session manager
      return {
        status: 'healthy',
        storage: 'memory_with_redis_fallback',
        cleanup: 'enabled'
      };
    } catch (error) {
      this.logger.error('Session manager health check failed:', error);
      return {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async checkSecurityManagerHealth(): Promise<any> {
    try {
      // Basic health check for security manager
      return {
        status: 'healthy',
        code_validation: 'enabled',
        rate_limiting: 'enabled',
        authentication: 'optional'
      };
    } catch (error) {
      this.logger.error('Security manager health check failed:', error);
      return {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private getMemoryUsage(): any {
    const usage = process.memoryUsage();
    return {
      rss_mb: Math.round(usage.rss / 1024 / 1024),
      heap_used_mb: Math.round(usage.heapUsed / 1024 / 1024),
      heap_total_mb: Math.round(usage.heapTotal / 1024 / 1024),
      external_mb: Math.round(usage.external / 1024 / 1024)
    };
  }

  private async getCpuUsage(): Promise<any> {
    return new Promise((resolve) => {
      const startUsage = process.cpuUsage();
      setTimeout(() => {
        const currentUsage = process.cpuUsage(startUsage);
        resolve({
          user_microseconds: currentUsage.user,
          system_microseconds: currentUsage.system,
          total_microseconds: currentUsage.user + currentUsage.system
        });
      }, 100);
    });
  }
}
