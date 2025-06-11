import { spawn, ChildProcess } from 'child_process';
import { Logger } from '../utils/Logger.js';
import { 
  ExecutionResult, 
  CodeExecutionParams, 
  PlaywrightSessionConfig,
  SUPPORTED_LANGUAGES 
} from '../types/McpTypes.js';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs/promises';
import PQueue from 'p-queue';
import NodeCache from 'node-cache';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

export class LocalExecutionManager {
  private logger = Logger.getInstance();
  private sessions = new Map<string, LocalSession>();
  private executionQueue: PQueue;
  private sessionCache: NodeCache;
  private initialized = false;
  private venvCache = new Map<string, string>(); // language -> venv path
  private portCache = new Map<number, boolean>();

  constructor() {
    // Initialize execution queue with concurrency limits
    this.executionQueue = new PQueue({
      concurrency: parseInt(process.env.MAX_CONCURRENT_EXECUTIONS || '10'),
      intervalCap: 50,
      interval: 1000,
      timeout: 60000
    });

    // Cache for session metadata
    this.sessionCache = new NodeCache({
      stdTTL: 300, // 5 minutes
      checkperiod: 60
    });

    // Initialize port range cache
    this.initializePortCache();
  }

  async initialize(): Promise<LocalExecutionManager> {
    if (this.initialized) {
      return this;
    }

    const startTime = Date.now();
    this.logger.info('🔧 Initializing Local Execution Manager...');

    try {
      // Initialize workspace directories
      await this.initializeWorkspaces();

      // Setup virtual environments for supported languages
      await this.setupVirtualEnvironments();

      // Install required packages
      await this.installLanguagePackages();

      // Clean up old sessions
      await this.cleanupOldSessions();

      const initTime = Date.now() - startTime;
      this.logger.info(`✅ Local Execution Manager initialized in ${initTime}ms`);
      
      this.initialized = true;
      return this;

    } catch (error) {
      this.logger.error('❌ Failed to initialize Local Execution Manager:', error);
      throw error;
    }
  }

  private async initializeWorkspaces(): Promise<void> {
    const workspaceRoot = '/app/sessions';
    const venvRoot = '/app/venvs';
    
    try {
      await fs.mkdir(workspaceRoot, { recursive: true });
      await fs.mkdir(venvRoot, { recursive: true });
      await fs.chmod(workspaceRoot, 0o755);
      await fs.chmod(venvRoot, 0o755);
      this.logger.debug('✅ Workspace directories initialized');
    } catch (error) {
      this.logger.error('Failed to initialize workspace directories:', error);
      throw error;
    }
  }

  private async setupVirtualEnvironments(): Promise<void> {
    this.logger.info('🐍 Setting up virtual environments for supported languages...');
    
    const languageSetup = {
      python: async () => {
        const venvPath = '/app/venvs/python';
        try {
          // Create Python virtual environment
          await execAsync(`python3 -m venv ${venvPath}`);
          this.venvCache.set('python', venvPath);
          this.logger.debug('✅ Python virtual environment created');
        } catch (error) {
          this.logger.warn('Failed to create Python venv:', error);
        }
      },
      
      javascript: async () => {
        // JavaScript/Node.js doesn't need venv but we can set up a project directory
        const projectPath = '/app/venvs/javascript';
        try {
          await fs.mkdir(projectPath, { recursive: true });
          await execAsync(`cd ${projectPath} && npm init -y`);
          this.venvCache.set('javascript', projectPath);
          this.logger.debug('✅ JavaScript project directory created');
        } catch (error) {
          this.logger.warn('Failed to create JavaScript project:', error);
        }
      },

      typescript: async () => {
        const projectPath = '/app/venvs/typescript';
        try {
          await fs.mkdir(projectPath, { recursive: true });
          await execAsync(`cd ${projectPath} && npm init -y`);
          this.venvCache.set('typescript', projectPath);
          this.logger.debug('✅ TypeScript project directory created');
        } catch (error) {
          this.logger.warn('Failed to create TypeScript project:', error);
        }
      },

      java: async () => {
        const projectPath = '/app/venvs/java';
        try {
          await fs.mkdir(projectPath, { recursive: true });
          await fs.mkdir(`${projectPath}/src`, { recursive: true });
          await fs.mkdir(`${projectPath}/lib`, { recursive: true });
          this.venvCache.set('java', projectPath);
          this.logger.debug('✅ Java project directory created');
        } catch (error) {
          this.logger.warn('Failed to create Java project:', error);
        }
      },

      rust: async () => {
        const projectPath = '/app/venvs/rust';
        try {
          await fs.mkdir(projectPath, { recursive: true });
          // Initialize a basic Cargo project if cargo is available
          try {
            await execAsync(`cd ${projectPath} && cargo init --name rust_project`);
          } catch {
            // Fallback: create basic structure manually
            await fs.mkdir(`${projectPath}/src`, { recursive: true });
            await fs.writeFile(`${projectPath}/src/main.rs`, 'fn main() {\n    println!("Hello, world!");\n}');
          }
          this.venvCache.set('rust', projectPath);
          this.logger.debug('✅ Rust project directory created');
        } catch (error) {
          this.logger.warn('Failed to create Rust project:', error);
        }
      },

      go: async () => {
        const projectPath = '/app/venvs/go';
        try {
          await fs.mkdir(projectPath, { recursive: true });
          await execAsync(`cd ${projectPath} && go mod init go_project`);
          this.venvCache.set('go', projectPath);
          this.logger.debug('✅ Go project directory created');
        } catch (error) {
          this.logger.warn('Failed to create Go project:', error);
        }
      }
    };

    // Set up environments for all supported languages
    const setupPromises = Object.entries(languageSetup).map(async ([lang, setupFn]) => {
      if (SUPPORTED_LANGUAGES[lang]) {
        await setupFn();
      }
    });

    await Promise.allSettled(setupPromises);
  }

  private async installLanguagePackages(): Promise<void> {
    this.logger.info('📦 Installing language packages...');

    // Install Python packages
    const pythonVenv = this.venvCache.get('python');
    if (pythonVenv) {
      try {
        const packages = [
          'requests', 'numpy', 'pandas', 'matplotlib', 'seaborn',
          'scikit-learn', 'jupyter', 'plotly', 'beautifulsoup4',
          'lxml', 'openpyxl', 'pillow', 'python-dateutil', 'pytz'
        ];
        
        await execAsync(`${pythonVenv}/bin/pip install ${packages.join(' ')}`);
        this.logger.debug('✅ Python packages installed');
      } catch (error) {
        this.logger.warn('Failed to install Python packages:', error);
      }
    }

    // Install Node.js packages
    const jsProject = this.venvCache.get('javascript');
    if (jsProject) {
      try {
        const packages = [
          'express', 'lodash', 'axios', 'moment', 'uuid',
          'jest', 'webpack', 'webpack-cli'
        ];
        
        await execAsync(`cd ${jsProject} && npm install ${packages.join(' ')}`);
        this.logger.debug('✅ JavaScript packages installed');
      } catch (error) {
        this.logger.warn('Failed to install JavaScript packages:', error);
      }
    }

    // Install TypeScript packages
    const tsProject = this.venvCache.get('typescript');
    if (tsProject) {
      try {
        const packages = [
          'typescript', 'ts-node', '@types/node', 'nodemon',
          'eslint', '@typescript-eslint/parser', '@typescript-eslint/eslint-plugin'
        ];
        
        await execAsync(`cd ${tsProject} && npm install ${packages.join(' ')}`);
        this.logger.debug('✅ TypeScript packages installed');
      } catch (error) {
        this.logger.warn('Failed to install TypeScript packages:', error);
      }
    }
  }

  private async cleanupOldSessions(): Promise<void> {
    try {
      const sessionsDir = '/app/sessions';
      const entries = await fs.readdir(sessionsDir).catch(() => []);
      
      for (const entry of entries) {
        const sessionPath = path.join(sessionsDir, entry);
        try {
          const stats = await fs.stat(sessionPath);
          // Clean up sessions older than 24 hours
          if (Date.now() - stats.mtime.getTime() > 24 * 60 * 60 * 1000) {
            await fs.rm(sessionPath, { recursive: true, force: true });
            this.logger.debug(`Cleaned up old session: ${entry}`);
          }
        } catch (error) {
          // Ignore errors for individual session cleanup
        }
      }
    } catch (error) {
      this.logger.warn('Failed to cleanup old sessions:', error);
    }
  }

  private initializePortCache(): void {
    const startPort = 8080;
    const endPort = 9999;
    
    for (let port = startPort; port <= endPort; port++) {
      this.portCache.set(port, false); // false = available
    }
  }

  async createExecutionSession(sessionId: string, language: string): Promise<string> {
    const langConfig = SUPPORTED_LANGUAGES[language];
    if (!langConfig) {
      throw new Error(`Unsupported language: ${language}`);
    }

    const workspaceDir = `/app/sessions/${sessionId}`;
    await fs.mkdir(workspaceDir, { recursive: true });

    const session = new LocalSession(sessionId, language, workspaceDir, this.venvCache.get(language));
    this.sessions.set(sessionId, session);

    this.logger.info(`Created local execution session for ${language}: ${sessionId}`);
    return sessionId;
  }

  async createVSCodeSession(sessionId: string, language?: string): Promise<string> {
    // For now, VS Code will run locally using code-server
    const workspaceDir = `/app/sessions/${sessionId}`;
    const port = await this.findAvailablePort(8080);

    await fs.mkdir(workspaceDir, { recursive: true });

    // Start code-server if available, otherwise simulate
    try {
      const codeServerProcess = spawn('code-server', [
        '--bind-addr', `0.0.0.0:${port}`,
        '--auth', 'none',
        '--disable-telemetry',
        workspaceDir
      ], {
        detached: true,
        stdio: 'pipe'
      });

      const session = new LocalSession(sessionId, 'vscode', workspaceDir);
      session.process = codeServerProcess;
      session.port = port;
      this.sessions.set(sessionId, session);

      this.logger.info(`Created VS Code session: ${sessionId} on port ${port}`);
      return sessionId;
    } catch (error) {
      this.logger.warn('Code-server not available, creating workspace only');
      const session = new LocalSession(sessionId, 'vscode', workspaceDir);
      this.sessions.set(sessionId, session);
      return sessionId;
    }
  }

  async createPlaywrightSession(sessionId: string, config: PlaywrightSessionConfig): Promise<any> {
    const workspaceDir = `/app/sessions/${sessionId}`;
    await fs.mkdir(workspaceDir, { recursive: true });

    // Install playwright in session workspace if not already available
    try {
      await execAsync(`cd ${workspaceDir} && npm init -y && npm install playwright`);
      await execAsync(`cd ${workspaceDir} && npx playwright install`);
    } catch (error) {
      this.logger.warn('Failed to install Playwright locally:', error);
    }

    const session = new LocalSession(sessionId, 'playwright', workspaceDir);
    this.sessions.set(sessionId, session);

    this.logger.info(`Created Playwright session: ${sessionId}`);
    return {
      contextId: sessionId,
      pageUrl: 'about:blank',
      browser: config.browser
    };
  }

  async executeCode(sessionId: string, params: CodeExecutionParams): Promise<ExecutionResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const langConfig = SUPPORTED_LANGUAGES[params.language];
    if (!langConfig) {
      throw new Error(`Unsupported language: ${params.language}`);
    }

    const fileName = `code_${Date.now()}_${Math.random().toString(36).substr(2, 9)}${langConfig.fileExtension}`;
    const filePath = path.join(session.workspaceDir, fileName);

    try {
      // Write code to file
      await fs.writeFile(filePath, params.code, 'utf8');

      // Execute code based on language
      const result = await this.executeLanguageCode(params.language, filePath, session, params);

      return result;
    } catch (error) {
      return {
        stdout: '',
        stderr: error instanceof Error ? error.message : 'Unknown error',
        exitCode: 1,
        executionTime: 0
      };
    }
  }

  private async executeLanguageCode(
    language: string, 
    filePath: string, 
    session: LocalSession, 
    params: CodeExecutionParams
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const timeout = params.timeout || 30000;

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let childProcess: ChildProcess;

      // Determine execution command based on language
      const getCommand = () => {
        const venvPath = session.venvPath;
        
        switch (language) {
          case 'python':
            return venvPath 
              ? [`${venvPath}/bin/python`, filePath]
              : ['python3', filePath];
          
          case 'javascript':
            return ['node', filePath];
          
          case 'typescript':
            return session.venvPath
              ? [`${session.venvPath}/node_modules/.bin/ts-node`, filePath]
              : ['ts-node', filePath];
          
          case 'java':
            const className = path.basename(filePath, '.java');
            return ['bash', '-c', `cd ${path.dirname(filePath)} && javac ${path.basename(filePath)} && java ${className}`];
          
          case 'rust':
            return ['bash', '-c', `cd ${path.dirname(filePath)} && rustc ${path.basename(filePath)} -o ${path.basename(filePath, '.rs')} && ./${path.basename(filePath, '.rs')}`];
          
          case 'go':
            return ['go', 'run', filePath];
          
          case 'c':
            return ['bash', '-c', `cd ${path.dirname(filePath)} && gcc ${path.basename(filePath)} -o ${path.basename(filePath, '.c')} && ./${path.basename(filePath, '.c')}`];
          
          case 'cpp':
            return ['bash', '-c', `cd ${path.dirname(filePath)} && g++ ${path.basename(filePath)} -o ${path.basename(filePath, '.cpp')} && ./${path.basename(filePath, '.cpp')}`];
          
          default:
            throw new Error(`Execution not implemented for language: ${language}`);
        }
      };

      try {
        const [command, ...args] = getCommand();
        childProcess = spawn(command, args, {
          cwd: session.workspaceDir,
          env: { ...process.env, PATH: process.env.PATH },
          stdio: 'pipe'
        });

        // Handle stdin if provided
        if (params.stdin && childProcess.stdin) {
          childProcess.stdin.write(params.stdin);
          childProcess.stdin.end();
        }

        // Collect stdout
        if (childProcess.stdout) {
          childProcess.stdout.on('data', (data) => {
            stdout += data.toString();
          });
        }

        // Collect stderr
        if (childProcess.stderr) {
          childProcess.stderr.on('data', (data) => {
            stderr += data.toString();
          });
        }

        // Handle process completion
        childProcess.on('close', (exitCode) => {
          const executionTime = Date.now() - startTime;
          resolve({
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            exitCode: exitCode || 0,
            executionTime
          });
        });

        // Handle timeout
        const timeoutHandle = setTimeout(() => {
          if (childProcess && !childProcess.killed) {
            childProcess.kill('SIGTERM');
            setTimeout(() => {
              if (!childProcess.killed) {
                childProcess.kill('SIGKILL');
              }
            }, 5000);
          }
          
          resolve({
            stdout: stdout.trim(),
            stderr: (stderr + '\n\nExecution timed out').trim(),
            exitCode: 124,
            executionTime: Date.now() - startTime
          });
        }, timeout);

        childProcess.on('close', () => {
          clearTimeout(timeoutHandle);
        });

      } catch (error) {
        resolve({
          stdout: '',
          stderr: error instanceof Error ? error.message : 'Execution failed',
          exitCode: 1,
          executionTime: Date.now() - startTime
        });
      }
    });
  }

  async getVSCodeUrl(sessionId: string): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session || session.language !== 'vscode') {
      throw new Error(`VS Code session not found: ${sessionId}`);
    }

    const port = session.port || 8080;
    return `http://localhost:${port}`;
  }

  private async findAvailablePort(startPort: number): Promise<number> {
    for (let port = startPort; port < startPort + 1000; port++) {
      if (!this.portCache.get(port)) {
        this.portCache.set(port, true);
        return port;
      }
    }
    throw new Error('No available ports found');
  }

  async destroySession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    // Kill any running process
    if (session.process && !session.process.killed) {
      session.process.kill('SIGTERM');
      setTimeout(() => {
        if (session.process && !session.process.killed) {
          session.process.kill('SIGKILL');
        }
      }, 5000);
    }

    // Clean up workspace
    try {
      await fs.rm(session.workspaceDir, { recursive: true, force: true });
    } catch (error) {
      this.logger.warn(`Failed to clean up workspace for session ${sessionId}:`, error);
    }

    // Free up port
    if (session.port) {
      this.portCache.set(session.port, false);
    }

    this.sessions.delete(sessionId);
    this.logger.info(`Destroyed session: ${sessionId}`);
  }

  async listSessions(): Promise<any[]> {
    const sessions = [];
    for (const [id, session] of this.sessions.entries()) {
      sessions.push({
        id,
        language: session.language,
        workspaceDir: session.workspaceDir,
        port: session.port,
        running: session.process ? !session.process.killed : false
      });
    }
    return sessions;
  }

  async cleanup(): Promise<void> {
    this.logger.info('🧹 Cleaning up Local Execution Manager...');
    
    // Destroy all sessions
    const cleanupPromises = Array.from(this.sessions.keys()).map(sessionId => 
      this.destroySession(sessionId)
    );
    
    await Promise.allSettled(cleanupPromises);
    
    this.logger.info('✅ Local Execution Manager cleanup completed');
  }
}

class LocalSession {
  public process?: ChildProcess;
  public port?: number;

  constructor(
    public id: string,
    public language: string,
    public workspaceDir: string,
    public venvPath?: string
  ) {}
}
