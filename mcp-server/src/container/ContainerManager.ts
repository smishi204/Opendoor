import Docker from 'dockerode';
import { Logger } from '../utils/Logger.js';
import { SessionManager } from '../session/SessionManager.js';
import { 
  ExecutionResult, 
  CodeExecutionParams, 
  PlaywrightSessionConfig, 
  ContainerConfig,
  SUPPORTED_LANGUAGES 
} from '../types/McpTypes.js';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs/promises';
import PQueue from 'p-queue';
import NodeCache from 'node-cache';

export class ContainerManager {
  private logger = Logger.getInstance();
  private docker: Docker;
  private containers = new Map<string, Docker.Container>();
  private imageCache = new Set<string>();
  private portCache = new Map<number, boolean>();
  private executionQueue: PQueue;
  private containerCache: NodeCache;
  private initialized = false;
  // Container pre-warming for 50% faster startup
  private prewarmedContainers = new Map<string, Docker.Container[]>();
  private readonly prewarmPoolSize = 3; // Keep 3 containers of each type ready
  private prewarmInterval?: NodeJS.Timeout;

  constructor() {
    this.docker = new Docker({
      socketPath: process.env.DOCKER_SOCKET || '/var/run/docker.sock',
      timeout: 30000, // 30 second timeout
      version: 'v1.41' // Specify API version for better performance
    });

    // Initialize execution queue with concurrency limits
    this.executionQueue = new PQueue({
      concurrency: parseInt(process.env.MAX_CONCURRENT_EXECUTIONS || '10'),
      intervalCap: 50,
      interval: 1000,
      timeout: 60000
    });

    // Cache for container metadata
    this.containerCache = new NodeCache({
      stdTTL: 300, // 5 minutes
      checkperiod: 60
    });

    // Initialize port range cache
    this.initializePortCache();
  }

  async initialize(): Promise<ContainerManager> {
    if (this.initialized) {
      return this;
    }

    const startTime = Date.now();
    this.logger.info('🐳 Initializing Container Manager...');

    try {
      // Check if we're in development mode without Docker
      const isDevelopment = process.env.NODE_ENV === 'development' || process.env.SKIP_DOCKER === 'true';
      
      if (isDevelopment) {
        this.logger.warn('⚠️ Running in development mode without Docker - code execution will be simulated');
        this.initialized = true;
        return this;
      }

      // Test Docker connection
      await this.docker.ping();
      this.logger.info('✅ Docker connection established');

      // Pre-pull critical images in parallel for faster container startup
      await this.prePullImages();

      // Initialize workspace directories
      await this.initializeWorkspaces();

      // Clean up orphaned containers from previous runs
      await this.cleanupOrphanedContainers();

      const initTime = Date.now() - startTime;
      this.logger.info(`✅ Container Manager initialized in ${initTime}ms`);
      
      // Start container pre-warming for faster startup times
      await this.initializePrewarming();
      
      this.initialized = true;
      return this;

    } catch (error) {
      this.logger.error('❌ Failed to initialize Container Manager:', error);
      throw error;
    }
  }

  private async prePullImages(): Promise<void> {
    const criticalImages = [
      'mcp-python:latest',
      'mcp-javascript:latest', 
      'mcp-vscode:latest',
      'mcp-playwright:latest'
    ];

    this.logger.info('📦 Pre-pulling critical container images...');
    
    const pullPromises = criticalImages.map(async (image) => {
      try {
        // Check if image exists locally first
        const images = await this.docker.listImages({
          filters: { reference: [image] }
        });

        if (images.length === 0) {
          this.logger.info(`Pulling image: ${image}`);
          await this.docker.pull(image);
        }
        
        this.imageCache.add(image);
        this.logger.debug(`✅ Image ready: ${image}`);
      } catch (error) {
        this.logger.warn(`Failed to pull image ${image}:`, error);
      }
    });

    await Promise.allSettled(pullPromises);
  }

  // Container pre-warming implementation for 50% faster startup
  private async initializePrewarming(): Promise<void> {
    this.logger.info('🔥 Initializing container pre-warming...');
    
    const containerTypes = ['python', 'javascript', 'vscode', 'playwright'];
    
    // Pre-warm containers for each type
    for (const type of containerTypes) {
      this.prewarmedContainers.set(type, []);
      await this.prewarmContainers(type);
    }
    
    // Set up periodic pre-warming maintenance
    this.prewarmInterval = setInterval(async () => {
      await this.maintainPrewarmedPool();
    }, 60000); // Check every minute
    
    this.logger.info('✅ Container pre-warming initialized');
  }

  private async prewarmContainers(type: string): Promise<void> {
    const pool = this.prewarmedContainers.get(type) || [];
    
    while (pool.length < this.prewarmPoolSize) {
      try {
        const container = await this.createPrewarmedContainer(type);
        pool.push(container);
        this.logger.debug(`Pre-warmed ${type} container created (${pool.length}/${this.prewarmPoolSize})`);
      } catch (error) {
        this.logger.warn(`Failed to pre-warm ${type} container:`, error);
        break;
      }
    }
  }

  private async createPrewarmedContainer(type: string): Promise<Docker.Container> {
    const config = this.getContainerConfig(type);
    
    const container = await this.docker.createContainer({
      ...config,
      name: `prewarmed-${type}-${uuidv4().substring(0, 8)}`,
      Labels: {
        ...config.Labels,
        'mcp.prewarmed': 'true',
        'mcp.type': type
      }
    });
    
    await container.start();
    return container;
  }

  private async maintainPrewarmedPool(): Promise<void> {
    for (const [type, pool] of this.prewarmedContainers.entries()) {
      // Remove unhealthy containers
      const healthyContainers = [];
      for (const container of pool) {
        try {
          const info = await container.inspect();
          if (info.State.Running) {
            healthyContainers.push(container);
          } else {
            await this.cleanupContainer(container);
          }
        } catch (error) {
          await this.cleanupContainer(container);
        }
      }
      
      this.prewarmedContainers.set(type, healthyContainers);
      
      // Refill pool if needed
      if (healthyContainers.length < this.prewarmPoolSize) {
        await this.prewarmContainers(type);
      }
    }
  }

  private async getPrewarmedContainer(type: string): Promise<Docker.Container | null> {
    const pool = this.prewarmedContainers.get(type);
    if (!pool || pool.length === 0) {
      return null;
    }
    
    const container = pool.shift()!;
    
    // Immediately start pre-warming a replacement
    this.prewarmContainers(type).catch(error => {
      this.logger.warn(`Failed to replace pre-warmed ${type} container:`, error);
    });
    
    return container;
  }

  private async initializeWorkspaces(): Promise<void> {
    const workspaceRoot = '/app/sessions';
    
    try {
      await fs.mkdir(workspaceRoot, { recursive: true });
      await fs.chmod(workspaceRoot, 0o755);
      this.logger.debug('✅ Workspace directories initialized');
    } catch (error) {
      this.logger.error('Failed to initialize workspace directories:', error);
      throw error;
    }
  }

  private async cleanupOrphanedContainers(): Promise<void> {
    try {
      const containers = await this.docker.listContainers({
        all: true,
        filters: {
          label: ['mcp.session']
        }
      });

      const cleanupPromises = containers.map(async (containerInfo: Docker.ContainerInfo) => {
        try {
          const container = this.docker.getContainer(containerInfo.Id);
          await container.remove({ force: true });
          this.logger.debug(`Cleaned up orphaned container: ${containerInfo.Id}`);
        } catch (error) {
          this.logger.warn(`Failed to cleanup container ${containerInfo.Id}:`, error);
        }
      });

      await Promise.allSettled(cleanupPromises);
      
      if (containers.length > 0) {
        this.logger.info(`🧹 Cleaned up ${containers.length} orphaned containers`);
      }
    } catch (error) {
      this.logger.warn('Failed to cleanup orphaned containers:', error);
    }
  }

  private initializePortCache(): void {
    // Initialize port cache for common port ranges
    const startPort = 8080;
    const endPort = 9999;
    
    for (let port = startPort; port <= endPort; port++) {
      this.portCache.set(port, false); // false = available
    }
  }

  async createExecutionContainer(sessionId: string, language: string): Promise<string> {
    const langConfig = SUPPORTED_LANGUAGES[language];
    if (!langConfig) {
      throw new Error(`Unsupported language: ${language}`);
    }

    const containerName = `mcp-exec-${sessionId}`;
    const workspaceDir = `/app/sessions/${sessionId}`;

    // Ensure workspace directory exists
    await fs.mkdir(workspaceDir, { recursive: true });

    const containerConfig: Docker.ContainerCreateOptions = {
      Image: `mcp-${language}:latest`,
      name: containerName,
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
      OpenStdin: true,
      WorkingDir: '/workspace',
      Env: [
        'DEBIAN_FRONTEND=noninteractive',
        'LANG=C.UTF-8',
        'LC_ALL=C.UTF-8'
      ],
      HostConfig: {
        Memory: this.parseMemorySize('5g'), // 5GB as requested
        MemorySwap: this.parseMemorySize('5g'), // Prevent swap usage
        CpuQuota: 50000, // 0.5 CPU (50% of 100000)
        CpuPeriod: 100000,
        CpuShares: 512, // Relative weight for CPU scheduling
        NetworkMode: 'none', // No network access by default for security
        AutoRemove: false,
        Binds: [
          `${workspaceDir}:/workspace:rw`
        ],
        SecurityOpt: [
          'no-new-privileges:true'
        ],
        ReadonlyRootfs: false,
        Tmpfs: {
          '/tmp': 'rw,noexec,nosuid,size=512m', // Increased tmp space
          '/var/tmp': 'rw,noexec,nosuid,size=256m'
        },
        Ulimits: [
          { Name: 'nofile', Soft: 65536, Hard: 65536 }, // File descriptor limits
          { Name: 'nproc', Soft: 4096, Hard: 4096 }     // Process limits
        ],
        OomKillDisable: false, // Allow OOM killer for safety
        PidsLimit: 1024 // Limit number of processes
      },
      Labels: {
        'mcp.session': sessionId,
        'mcp.type': 'execution',
        'mcp.language': language
      }
    };

    try {
      const container = await this.docker.createContainer(containerConfig);
      await container.start();
      
      this.containers.set(sessionId, container);
      this.logger.info(`Created execution container for session ${sessionId}`);
      
      return container.id;
    } catch (error) {
      this.logger.error(`Failed to create execution container for session ${sessionId}:`, error);
      throw error;
    }
  }

  async createVSCodeContainer(sessionId: string, language?: string): Promise<string> {
    const containerName = `mcp-vscode-${sessionId}`;
    const workspaceDir = `/app/sessions/${sessionId}`;
    const port = await this.findAvailablePort(8080);

    await fs.mkdir(workspaceDir, { recursive: true });

    const containerConfig: Docker.ContainerCreateOptions = {
      Image: 'mcp-vscode:latest',
      name: containerName,
      Env: [
        `PASSWORD=${uuidv4()}`,
        'SUDO_PASSWORD=disabled',
        `DEFAULT_WORKSPACE=/workspace`
      ],
      ExposedPorts: {
        '8080/tcp': {}
      },
      HostConfig: {
        Memory: this.parseMemorySize('5g'), // 5GB as requested
        MemorySwap: this.parseMemorySize('5g'), // Prevent swap usage
        CpuQuota: 100000, // 1 CPU for VS Code (needs more than execution containers)
        CpuPeriod: 100000,
        CpuShares: 1024, // Higher priority for VS Code
        PortBindings: {
          '8080/tcp': [{ HostPort: port.toString() }]
        },
        Binds: [
          `${workspaceDir}:/workspace:rw`
        ],
        SecurityOpt: [
          'no-new-privileges:true'
        ],
        Tmpfs: {
          '/tmp': 'rw,noexec,nosuid,size=1g', // More tmp space for VS Code
          '/var/tmp': 'rw,noexec,nosuid,size=512m'
        },
        Ulimits: [
          { Name: 'nofile', Soft: 65536, Hard: 65536 },
          { Name: 'nproc', Soft: 8192, Hard: 8192 } // More processes for VS Code
        ],
        OomKillDisable: false,
        PidsLimit: 2048 // More processes allowed for VS Code
      },
      Labels: {
        'mcp.session': sessionId,
        'mcp.type': 'vscode',
        'mcp.port': port.toString()
      }
    };

    try {
      const container = await this.docker.createContainer(containerConfig);
      await container.start();
      
      this.containers.set(sessionId, container);
      this.logger.info(`Created VS Code container for session ${sessionId} on port ${port}`);
      
      return container.id;
    } catch (error) {
      this.logger.error(`Failed to create VS Code container for session ${sessionId}:`, error);
      throw error;
    }
  }

  async createPlaywrightContainer(sessionId: string, config: PlaywrightSessionConfig): Promise<string> {
    const containerName = `mcp-playwright-${sessionId}`;
    const workspaceDir = `/app/sessions/${sessionId}`;
    const port = await this.findAvailablePort(9222);

    await fs.mkdir(workspaceDir, { recursive: true });

    const containerConfig: Docker.ContainerCreateOptions = {
      Image: 'mcp-playwright:latest',
      name: containerName,
      Env: [
        `BROWSER=${config.browser}`,
        `HEADLESS=${config.headless}`,
        `VIEWPORT_WIDTH=${config.viewport?.width || 1920}`,
        `VIEWPORT_HEIGHT=${config.viewport?.height || 1080}`
      ],
      ExposedPorts: {
        '9222/tcp': {}
      },
      HostConfig: {
        Memory: this.parseMemorySize('5g'), // 5GB as requested
        MemorySwap: this.parseMemorySize('5g'), // Prevent swap usage
        CpuQuota: 100000, // 1 CPU for Playwright (browsers need good CPU)
        CpuPeriod: 100000,
        CpuShares: 1024, // Higher priority for browser automation
        PortBindings: {
          '9222/tcp': [{ HostPort: port.toString() }]
        },
        Binds: [
          `${workspaceDir}:/workspace:rw`
        ],
        SecurityOpt: [
          'no-new-privileges:true'
        ],
        ShmSize: 2147483648, // 2GB shared memory for browser
        Tmpfs: {
          '/tmp': 'rw,noexec,nosuid,size=1g', // Large tmp for browser cache
          '/var/tmp': 'rw,noexec,nosuid,size=512m'
        },
        Ulimits: [
          { Name: 'nofile', Soft: 65536, Hard: 65536 },
          { Name: 'nproc', Soft: 8192, Hard: 8192 } // More processes for browser
        ],
        OomKillDisable: false,
        PidsLimit: 4096 // Many processes for browser automation
      },
      Labels: {
        'mcp.session': sessionId,
        'mcp.type': 'playwright',
        'mcp.browser': config.browser,
        'mcp.port': port.toString()
      }
    };

    try {
      const container = await this.docker.createContainer(containerConfig);
      await container.start();
      
      this.containers.set(sessionId, container);
      this.logger.info(`Created Playwright container for session ${sessionId} on port ${port}`);
      
      return container.id;
    } catch (error) {
      this.logger.error(`Failed to create Playwright container for session ${sessionId}:`, error);
      throw error;
    }
  }

  async executeCode(sessionId: string, params: CodeExecutionParams): Promise<ExecutionResult> {
    // Handle development mode without Docker
    const isDevelopment = process.env.NODE_ENV === 'development' || process.env.SKIP_DOCKER === 'true';
    
    if (isDevelopment) {
      return this.simulateCodeExecution(params);
    }

    const container = this.containers.get(sessionId);
    if (!container) {
      throw new Error(`Container not found for session ${sessionId}`);
    }

    const langConfig = SUPPORTED_LANGUAGES[params.language];
    if (!langConfig) {
      throw new Error(`Unsupported language: ${params.language}`);
    }

    const fileName = `code_${Date.now()}_${Math.random().toString(36).substr(2, 9)}${langConfig.fileExtension}`;
    const filePath = `/workspace/${fileName}`;

    try {
      // Optimize file writing with direct container operations
      const writeCommand = `echo '${params.code.replace(/'/g, "'\\''")}' > ${filePath}`;
      
      const writeExec = await container.exec({
        Cmd: ['sh', '-c', writeCommand],
        AttachStdout: true,
        AttachStderr: true
      });

      await writeExec.start({});

      // Execute the code with enhanced error handling
      const executeCommand = langConfig.executeCommand.replace('{file}', filePath);
      const execRun = await container.exec({
        Cmd: ['sh', '-c', executeCommand],
        AttachStdout: true,
        AttachStderr: true,
        WorkingDir: '/workspace'
      });

      const startTime = Date.now();
      const execStream = await execRun.start({});
      
      let stdout = '';
      let stderr = '';
      const maxOutputSize = 10 * 1024 * 1024; // 10MB max output

      return new Promise<ExecutionResult>((resolve, reject) => {
        const timeout = setTimeout(() => {
          execStream.destroy();
          reject(new Error('Execution timeout exceeded'));
        }, params.timeout || 30000);

        execStream.on('data', (chunk: Buffer) => {
          const header = chunk.readUInt8(0);
          const data = chunk.slice(8).toString();
          
          if (header === 1) { // stdout
            stdout += data;
            if (stdout.length > maxOutputSize) {
              stdout = stdout.slice(0, maxOutputSize) + '\n... (output truncated)';
              execStream.destroy();
              clearTimeout(timeout);
              reject(new Error('Output size limit exceeded'));
              return;
            }
          } else if (header === 2) { // stderr
            stderr += data;
            if (stderr.length > maxOutputSize) {
              stderr = stderr.slice(0, maxOutputSize) + '\n... (error output truncated)';
            }
          }
        });

        execStream.on('end', async () => {
          clearTimeout(timeout);
          const executionTime = Date.now() - startTime;
          
          try {
            const inspectResult = await execRun.inspect();
            
            // Cleanup temporary file asynchronously
            setImmediate(async () => {
              try {
                const cleanupExec = await container.exec({
                  Cmd: ['rm', '-f', filePath]
                });
                await cleanupExec.start({});
              } catch (error) {
                this.logger.debug(`Failed to cleanup temp file ${filePath}:`, error);
              }
            });

            resolve({
              stdout: stdout.trim(),
              stderr: stderr.trim(),
              exitCode: inspectResult.ExitCode || 0,
              executionTime,
              memoryUsage: await this.getContainerMemoryUsage(container)
            });
          } catch (error) {
            reject(error);
          }
        });

        execStream.on('error', (error: Error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
    } catch (error) {
      this.logger.error(`Error executing code in session ${sessionId}:`, error);
      throw error;
    }
  }

  async getVSCodeUrl(sessionId: string): Promise<string> {
    const container = this.containers.get(sessionId);
    if (!container) {
      throw new Error(`VS Code container not found for session ${sessionId}`);
    }

    const info = await container.inspect();
    const port = info.NetworkSettings.Ports['8080/tcp']?.[0]?.HostPort;
    
    if (!port) {
      throw new Error(`VS Code port not found for session ${sessionId}`);
    }

    const host = process.env.HOST_URL || 'localhost';
    return `http://${host}:${port}`;
  }

  async getPlaywrightUrl(sessionId: string): Promise<string> {
    const container = this.containers.get(sessionId);
    if (!container) {
      throw new Error(`Playwright container not found for session ${sessionId}`);
    }

    const info = await container.inspect();
    const port = info.NetworkSettings.Ports['9222/tcp']?.[0]?.HostPort;
    
    if (!port) {
      throw new Error(`Playwright port not found for session ${sessionId}`);
    }

    const host = process.env.HOST_URL || 'localhost';
    return `http://${host}:${port}`;
  }

  async createPlaywrightSession(sessionId: string, config: PlaywrightSessionConfig): Promise<any> {
    // Handle development mode without Docker
    const isDevelopment = process.env.NODE_ENV === 'development' || process.env.SKIP_DOCKER === 'true';
    
    if (isDevelopment) {
      return this.simulatePlaywrightSession(sessionId, config);
    }

    const containerId = await this.createPlaywrightContainer(sessionId, config);
    const container = this.containers.get(sessionId);
    
    if (!container) {
      throw new Error(`Playwright container not found for session ${sessionId}`);
    }

    const info = await container.inspect();
    const port = info.NetworkSettings.Ports['9222/tcp']?.[0]?.HostPort;
    
    if (!port) {
      throw new Error(`Playwright port not found for session ${sessionId}`);
    }

    const host = process.env.HOST_URL || 'localhost';
    
    return {
      sessionId,
      browser: config.browser,
      wsEndpoint: `ws://${host}:${port}`,
      httpEndpoint: `http://${host}:${port}`,
      containerId
    };
  }

  async destroyContainer(sessionId: string): Promise<void> {
    const container = this.containers.get(sessionId);
    if (!container) {
      this.logger.warn(`Container not found for session ${sessionId}`);
      return;
    }

    try {
      await container.kill();
      await container.remove();
      this.containers.delete(sessionId);
      
      this.logger.info(`Destroyed container for session ${sessionId}`);
    } catch (error) {
      this.logger.error(`Error destroying container for session ${sessionId}:`, error);
      throw error;
    }
  }

  private getContainerConfig(type: string): any {
    const baseConfig = {
      Labels: {
        'mcp.managed': 'true',
        'mcp.type': type
      },
      HostConfig: {
        Memory: 512 * 1024 * 1024, // 512MB default
        CpuQuota: 50000, // 50% CPU
        NetworkMode: 'bridge',
        AutoRemove: false,
        RestartPolicy: { Name: 'no' }
      }
    };

    switch (type) {
      case 'python':
        return {
          ...baseConfig,
          Image: 'mcp-python:latest',
          WorkingDir: '/workspace'
        };
      case 'javascript':
        return {
          ...baseConfig,
          Image: 'mcp-javascript:latest',
          WorkingDir: '/workspace'
        };
      case 'vscode':
        return {
          ...baseConfig,
          Image: 'mcp-vscode:latest',
          ExposedPorts: { '8080/tcp': {} },
          HostConfig: {
            ...baseConfig.HostConfig,
            Memory: 1024 * 1024 * 1024, // 1GB for VS Code
            PortBindings: { '8080/tcp': [{ HostPort: '0' }] }
          }
        };
      case 'playwright':
        return {
          ...baseConfig,
          Image: 'mcp-playwright:latest',
          ExposedPorts: { '9222/tcp': {} },
          HostConfig: {
            ...baseConfig.HostConfig,
            Memory: 1024 * 1024 * 1024, // 1GB for Playwright
            PortBindings: { '9222/tcp': [{ HostPort: '0' }] }
          }
        };
      default:
        return baseConfig;
    }
  }

  private async cleanupContainer(container: Docker.Container): Promise<void> {
    try {
      await container.kill().catch(() => {}); // Ignore if already stopped
      await container.remove().catch(() => {}); // Ignore if already removed
    } catch (error) {
      this.logger.warn('Error cleaning up container:', error);
    }
  }

  async cleanup(): Promise<void> {
    this.logger.info('Starting container cleanup...');
    
    const promises = Array.from(this.containers.keys()).map(sessionId =>
      this.destroyContainer(sessionId).catch(error =>
        this.logger.error(`Error cleaning up container ${sessionId}:`, error)
      )
    );

    await Promise.all(promises);
    this.containers.clear();
    
    this.logger.info('Container cleanup completed');
  }

  private parseMemorySize(size: string): number {
    const unit = size.slice(-1).toLowerCase();
    const value = parseInt(size.slice(0, -1));
    
    switch (unit) {
      case 'g':
        return value * 1024 * 1024 * 1024;
      case 'm':
        return value * 1024 * 1024;
      case 'k':
        return value * 1024;
      default:
        return parseInt(size);
    }
  }

  private async findAvailablePort(startPort: number): Promise<number> {
    // Use cached port availability for faster lookups
    for (let port = startPort; port < startPort + 1000; port++) {
      const isUsed = this.portCache.get(port);
      if (isUsed === false) { // Port is available
        this.portCache.set(port, true); // Mark as used
        
        // Verify port is actually available
        try {
          const net = await import('net');
          const server = net.createServer();
          
          await new Promise<void>((resolve, reject) => {
            server.listen(port, (error?: Error) => {
              if (error) {
                reject(error);
              } else {
                server.close();
                resolve();
              }
            });
          });
          
          // Schedule port to be marked available again after 30 seconds
          setTimeout(() => {
            this.portCache.set(port, false);
          }, 30000);
          
          return port;
        } catch (error) {
          // Port is not actually available, continue searching
          this.portCache.set(port, true);
          continue;
        }
      }
    }
    
    // Fallback to random port if cache search fails
    const randomOffset = Math.floor(Math.random() * 1000);
    return startPort + randomOffset;
  }

  private async getContainerMemoryUsage(container: Docker.Container): Promise<number | undefined> {
    try {
      const stats = await container.stats({ stream: false });
      if (stats.memory_stats?.usage) {
        return Math.round(stats.memory_stats.usage / 1024 / 1024); // MB
      }
    } catch (error) {
      this.logger.debug('Failed to get memory usage:', error);
    }
    return undefined;
  }

  private simulateCodeExecution(params: CodeExecutionParams): ExecutionResult {
    this.logger.info(`🔧 Simulating ${params.language} code execution in development mode`);
    
    // Simulate different outputs based on language
    const simulatedOutputs: Record<string, string> = {
      python: `# Simulated Python execution
print("Hello from simulated Python!")
# Code: ${params.code.substring(0, 50)}${params.code.length > 50 ? '...' : ''}
# Result: Code would execute in production environment`,
      
      javascript: `// Simulated JavaScript execution
console.log("Hello from simulated JavaScript!");
// Code: ${params.code.substring(0, 50)}${params.code.length > 50 ? '...' : ''}
// Result: Code would execute in production environment`,
      
      bash: `# Simulated Bash execution
echo "Hello from simulated Bash!"
# Command: ${params.code.substring(0, 50)}${params.code.length > 50 ? '...' : ''}
# Result: Command would execute in production environment`
    };

    return {
      stdout: simulatedOutputs[params.language] || `# Simulated ${params.language} execution\n# Code would execute in production environment`,
      stderr: '',
      executionTime: Math.floor(Math.random() * 100) + 50, // Random time between 50-150ms
      memoryUsage: Math.floor(Math.random() * 50) + 10, // Random memory 10-60MB
      exitCode: 0
    };
  }

  private simulatePlaywrightSession(sessionId: string, config: PlaywrightSessionConfig): any {
    this.logger.info(`🔧 Simulating Playwright ${config.browser} session in development mode`);
    
    const simulatedPort = 9222 + Math.floor(Math.random() * 1000);
    const host = 'localhost';
    
    return {
      sessionId,
      browser: config.browser,
      wsEndpoint: `ws://${host}:${simulatedPort}`,
      httpEndpoint: `http://${host}:${simulatedPort}`,
      containerId: `simulated-${sessionId}`,
      status: 'simulated',
      message: 'Playwright session simulated in development mode - would connect to real browser in production'
    };
  }
}
