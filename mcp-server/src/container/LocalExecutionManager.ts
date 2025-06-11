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
    this.logger.info('🌐 Setting up isolated virtual environments for all supported languages...');
    
    const languageSetup = {
      python: async () => {
        const venvPath = '/app/venvs/python';
        try {
          // Create Python virtual environment with isolated pip
          await execAsync(`python3 -m venv ${venvPath} --clear`);
          await execAsync(`${venvPath}/bin/pip install --upgrade pip setuptools wheel`);
          this.venvCache.set('python', venvPath);
          this.logger.debug('✅ Python virtual environment created with isolated pip');
        } catch (error) {
          this.logger.warn('Failed to create Python venv:', error);
        }
      },
      
      javascript: async () => {
        const projectPath = '/app/venvs/javascript';
        try {
          await fs.mkdir(projectPath, { recursive: true });
          await fs.writeFile(`${projectPath}/package.json`, JSON.stringify({
            name: "javascript-env",
            version: "1.0.0",
            private: true,
            type: "module"
          }, null, 2));
          await fs.mkdir(`${projectPath}/node_modules`, { recursive: true });
          this.venvCache.set('javascript', projectPath);
          this.logger.debug('✅ JavaScript isolated environment created');
        } catch (error) {
          this.logger.warn('Failed to create JavaScript environment:', error);
        }
      },

      typescript: async () => {
        const projectPath = '/app/venvs/typescript';
        try {
          await fs.mkdir(projectPath, { recursive: true });
          await fs.writeFile(`${projectPath}/package.json`, JSON.stringify({
            name: "typescript-env",
            version: "1.0.0",
            private: true,
            type: "module"
          }, null, 2));
          await fs.writeFile(`${projectPath}/tsconfig.json`, JSON.stringify({
            compilerOptions: {
              target: "ES2022",
              module: "ESNext",
              moduleResolution: "node",
              esModuleInterop: true,
              allowSyntheticDefaultImports: true,
              strict: true,
              skipLibCheck: true
            }
          }, null, 2));
          this.venvCache.set('typescript', projectPath);
          this.logger.debug('✅ TypeScript isolated environment created');
        } catch (error) {
          this.logger.warn('Failed to create TypeScript environment:', error);
        }
      },

      java: async () => {
        const projectPath = '/app/venvs/java';
        try {
          await fs.mkdir(projectPath, { recursive: true });
          await fs.mkdir(`${projectPath}/src`, { recursive: true });
          await fs.mkdir(`${projectPath}/lib`, { recursive: true });
          await fs.mkdir(`${projectPath}/build`, { recursive: true });
          this.venvCache.set('java', projectPath);
          this.logger.debug('✅ Java isolated environment created');
        } catch (error) {
          this.logger.warn('Failed to create Java environment:', error);
        }
      },

      rust: async () => {
        const projectPath = '/app/venvs/rust';
        try {
          await fs.mkdir(projectPath, { recursive: true });
          // Set CARGO_HOME for this environment
          const cargoHome = `${projectPath}/.cargo`;
          await fs.mkdir(cargoHome, { recursive: true });
          
          try {
            await execAsync(`cd ${projectPath} && CARGO_HOME=${cargoHome} cargo init --name rust_project --quiet`);
          } catch {
            // Fallback: create basic structure manually
            await fs.mkdir(`${projectPath}/src`, { recursive: true });
            await fs.writeFile(`${projectPath}/src/main.rs`, 'fn main() {\n    println!("Hello, world!");\n}');
            await fs.writeFile(`${projectPath}/Cargo.toml`, `[package]\nname = "rust_project"\nversion = "0.1.0"\nedition = "2021"\n\n[dependencies]\n`);
          }
          this.venvCache.set('rust', projectPath);
          this.logger.debug('✅ Rust isolated environment created');
        } catch (error) {
          this.logger.warn('Failed to create Rust environment:', error);
        }
      },

      go: async () => {
        const projectPath = '/app/venvs/go';
        try {
          await fs.mkdir(projectPath, { recursive: true });
          // Set GOPATH for this environment
          const goPath = `${projectPath}/gopath`;
          await fs.mkdir(goPath, { recursive: true });
          await fs.mkdir(`${goPath}/src`, { recursive: true });
          await fs.mkdir(`${goPath}/bin`, { recursive: true });
          await fs.mkdir(`${goPath}/pkg`, { recursive: true });
          
          await execAsync(`cd ${projectPath} && GOPATH=${goPath} go mod init go_project`);
          this.venvCache.set('go', projectPath);
          this.logger.debug('✅ Go isolated environment created');
        } catch (error) {
          this.logger.warn('Failed to create Go environment:', error);
        }
      },

      php: async () => {
        const projectPath = '/app/venvs/php';
        try {
          await fs.mkdir(projectPath, { recursive: true });
          await fs.writeFile(`${projectPath}/composer.json`, JSON.stringify({
            name: "php-env/project",
            type: "project",
            require: {},
            autoload: {
              "psr-4": { "": "src/" }
            }
          }, null, 2));
          await fs.mkdir(`${projectPath}/src`, { recursive: true });
          this.venvCache.set('php', projectPath);
          this.logger.debug('✅ PHP isolated environment created');
        } catch (error) {
          this.logger.warn('Failed to create PHP environment:', error);
        }
      },

      ruby: async () => {
        const projectPath = '/app/venvs/ruby';
        try {
          await fs.mkdir(projectPath, { recursive: true });
          await fs.writeFile(`${projectPath}/Gemfile`, 'source "https://rubygems.org"\n\nruby ">= 2.7.0"\n\n# Add your gems here\n');
          await fs.writeFile(`${projectPath}/.ruby-version`, '3.0.0');
          this.venvCache.set('ruby', projectPath);
          this.logger.debug('✅ Ruby isolated environment created');
        } catch (error) {
          this.logger.warn('Failed to create Ruby environment:', error);
        }
      },

      perl: async () => {
        const projectPath = '/app/venvs/perl';
        try {
          await fs.mkdir(projectPath, { recursive: true });
          await fs.mkdir(`${projectPath}/lib`, { recursive: true });
          await fs.mkdir(`${projectPath}/local`, { recursive: true });
          // Create cpanfile for dependencies
          await fs.writeFile(`${projectPath}/cpanfile`, '# Add Perl modules here\n');
          this.venvCache.set('perl', projectPath);
          this.logger.debug('✅ Perl isolated environment created');
        } catch (error) {
          this.logger.warn('Failed to create Perl environment:', error);
        }
      },

      lua: async () => {
        const projectPath = '/app/venvs/lua';
        try {
          await fs.mkdir(projectPath, { recursive: true });
          await fs.mkdir(`${projectPath}/lib`, { recursive: true });
          this.venvCache.set('lua', projectPath);
          this.logger.debug('✅ Lua isolated environment created');
        } catch (error) {
          this.logger.warn('Failed to create Lua environment:', error);
        }
      },

      c: async () => {
        const projectPath = '/app/venvs/c';
        try {
          await fs.mkdir(projectPath, { recursive: true });
          await fs.mkdir(`${projectPath}/src`, { recursive: true });
          await fs.mkdir(`${projectPath}/build`, { recursive: true });
          await fs.mkdir(`${projectPath}/include`, { recursive: true });
          this.venvCache.set('c', projectPath);
          this.logger.debug('✅ C isolated environment created');
        } catch (error) {
          this.logger.warn('Failed to create C environment:', error);
        }
      },

      cpp: async () => {
        const projectPath = '/app/venvs/cpp';
        try {
          await fs.mkdir(projectPath, { recursive: true });
          await fs.mkdir(`${projectPath}/src`, { recursive: true });
          await fs.mkdir(`${projectPath}/build`, { recursive: true });
          await fs.mkdir(`${projectPath}/include`, { recursive: true });
          this.venvCache.set('cpp', projectPath);
          this.logger.debug('✅ C++ isolated environment created');
        } catch (error) {
          this.logger.warn('Failed to create C++ environment:', error);
        }
      },

      csharp: async () => {
        const projectPath = '/app/venvs/csharp';
        try {
          await fs.mkdir(projectPath, { recursive: true });
          // Create a basic .NET project structure
          try {
            await execAsync(`cd ${projectPath} && dotnet new console --force --name CSharpProject`);
          } catch {
            // Fallback: create basic structure manually
            await fs.writeFile(`${projectPath}/Program.cs`, 'using System;\n\nclass Program\n{\n    static void Main()\n    {\n        Console.WriteLine("Hello World!");\n    }\n}');
          }
          this.venvCache.set('csharp', projectPath);
          this.logger.debug('✅ C# isolated environment created');
        } catch (error) {
          this.logger.warn('Failed to create C# environment:', error);
        }
      },

      swift: async () => {
        const projectPath = '/app/venvs/swift';
        try {
          await fs.mkdir(projectPath, { recursive: true });
          try {
            await execAsync(`cd ${projectPath} && swift package init --type executable --name SwiftProject`);
          } catch {
            // Fallback: create basic structure manually
            await fs.mkdir(`${projectPath}/Sources`, { recursive: true });
            await fs.writeFile(`${projectPath}/Sources/main.swift`, 'print("Hello, World!")');
          }
          this.venvCache.set('swift', projectPath);
          this.logger.debug('✅ Swift isolated environment created');
        } catch (error) {
          this.logger.warn('Failed to create Swift environment:', error);
        }
      },

      objc: async () => {
        const projectPath = '/app/venvs/objc';
        try {
          await fs.mkdir(projectPath, { recursive: true });
          await fs.mkdir(`${projectPath}/src`, { recursive: true });
          await fs.mkdir(`${projectPath}/build`, { recursive: true });
          this.venvCache.set('objc', projectPath);
          this.logger.debug('✅ Objective-C isolated environment created');
        } catch (error) {
          this.logger.warn('Failed to create Objective-C environment:', error);
        }
      }
    };

    // Set up environments for all supported languages in parallel
    const setupPromises = Object.entries(SUPPORTED_LANGUAGES).map(async ([lang]) => {
      const setupFn = languageSetup[lang as keyof typeof languageSetup];
      if (setupFn) {
        await setupFn();
      }
    });

    await Promise.allSettled(setupPromises);
    this.logger.info(`✅ Created isolated environments for ${Object.keys(this.venvCache).length} languages`);
  }

  private async installLanguagePackages(): Promise<void> {
    this.logger.info('📦 Installing essential packages for all language environments...');

    const installOperations = [];

    // Install Python packages
    const pythonVenv = this.venvCache.get('python');
    if (pythonVenv) {
      installOperations.push(async () => {
        try {
          const packages = [
            'requests', 'numpy', 'pandas', 'matplotlib', 'seaborn',
            'scikit-learn', 'jupyter', 'plotly', 'beautifulsoup4',
            'lxml', 'openpyxl', 'pillow', 'python-dateutil', 'pytz',
            'flask', 'fastapi', 'pytest', 'black', 'flake8'
          ];
          
          await execAsync(`${pythonVenv}/bin/pip install ${packages.join(' ')} --quiet --no-warn-script-location`);
          this.logger.debug('✅ Python packages installed in virtual environment');
        } catch (error) {
          this.logger.warn('Failed to install Python packages:', error);
        }
      });
    }

    // Install Node.js packages for JavaScript
    const jsProject = this.venvCache.get('javascript');
    if (jsProject) {
      installOperations.push(async () => {
        try {
          const packages = [
            'express', 'lodash', 'axios', 'uuid', 'chalk',
            'jest', 'webpack', 'webpack-cli', 'nodemon',
            'eslint', 'prettier'
          ];
          
          await execAsync(`cd ${jsProject} && npm install ${packages.join(' ')} --silent`);
          this.logger.debug('✅ JavaScript packages installed in isolated environment');
        } catch (error) {
          this.logger.warn('Failed to install JavaScript packages:', error);
        }
      });
    }

    // Install TypeScript packages
    const tsProject = this.venvCache.get('typescript');
    if (tsProject) {
      installOperations.push(async () => {
        try {
          const packages = [
            'typescript', 'ts-node', '@types/node', 'nodemon',
            'eslint', '@typescript-eslint/parser', '@typescript-eslint/eslint-plugin',
            'prettier', 'jest', '@types/jest', 'ts-jest'
          ];
          
          await execAsync(`cd ${tsProject} && npm install ${packages.join(' ')} --silent`);
          this.logger.debug('✅ TypeScript packages installed in isolated environment');
        } catch (error) {
          this.logger.warn('Failed to install TypeScript packages:', error);
        }
      });
    }

    // Install Ruby gems
    const rubyProject = this.venvCache.get('ruby');
    if (rubyProject) {
      installOperations.push(async () => {
        try {
          // Add common gems to Gemfile
          const gemfileContent = `source "https://rubygems.org"

ruby ">= 2.7.0"

gem "json"
gem "net-http"
gem "nokogiri"
gem "rspec"
gem "rubocop"
gem "bundler"
`;
          await fs.writeFile(`${rubyProject}/Gemfile`, gemfileContent);
          await execAsync(`cd ${rubyProject} && bundle install --quiet`);
          this.logger.debug('✅ Ruby gems installed in isolated environment');
        } catch (error) {
          this.logger.warn('Failed to install Ruby gems:', error);
        }
      });
    }

    // Install PHP packages via Composer
    const phpProject = this.venvCache.get('php');
    if (phpProject) {
      installOperations.push(async () => {
        try {
          const composerContent = {
            name: "php-env/project",
            type: "project",
            require: {
              "php": ">=7.4",
              "guzzlehttp/guzzle": "^7.0",
              "symfony/console": "^5.0",
              "monolog/monolog": "^2.0"
            },
            "require-dev": {
              "phpunit/phpunit": "^9.0"
            },
            autoload: {
              "psr-4": { "": "src/" }
            }
          };
          
          await fs.writeFile(`${phpProject}/composer.json`, JSON.stringify(composerContent, null, 2));
          await execAsync(`cd ${phpProject} && composer install --quiet --no-dev`);
          this.logger.debug('✅ PHP packages installed in isolated environment');
        } catch (error) {
          this.logger.warn('Failed to install PHP packages:', error);
        }
      });
    }

    // Install Rust dependencies
    const rustProject = this.venvCache.get('rust');
    if (rustProject) {
      installOperations.push(async () => {
        try {
          // Add common dependencies to Cargo.toml
          const cargoContent = `[package]
name = "rust_project"
version = "0.1.0"
edition = "2021"

[dependencies]
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
reqwest = { version = "0.11", features = ["json"] }
tokio = { version = "1.0", features = ["full"] }
`;
          
          await fs.writeFile(`${rustProject}/Cargo.toml`, cargoContent);
          const cargoHome = `${rustProject}/.cargo`;
          await execAsync(`cd ${rustProject} && CARGO_HOME=${cargoHome} cargo build --quiet`);
          this.logger.debug('✅ Rust dependencies installed in isolated environment');
        } catch (error) {
          this.logger.warn('Failed to install Rust dependencies:', error);
        }
      });
    }

    // Install Go modules
    const goProject = this.venvCache.get('go');
    if (goProject) {
      installOperations.push(async () => {
        try {
          const goPath = `${goProject}/gopath`;
          // Add common Go modules
          const modules = [
            'github.com/gin-gonic/gin@latest',
            'github.com/gorilla/mux@latest',
            'encoding/json@latest'
          ];
          
          for (const module of modules.slice(0, 2)) { // Skip built-in modules
            await execAsync(`cd ${goProject} && GOPATH=${goPath} go get ${module}`);
          }
          this.logger.debug('✅ Go modules installed in isolated environment');
        } catch (error) {
          this.logger.warn('Failed to install Go modules:', error);
        }
      });
    }

    // Install Perl modules
    const perlProject = this.venvCache.get('perl');
    if (perlProject) {
      installOperations.push(async () => {
        try {
          const cpanfileContent = `requires 'JSON';
requires 'LWP::UserAgent';
requires 'DBI';
requires 'Test::More';
`;
          await fs.writeFile(`${perlProject}/cpanfile`, cpanfileContent);
          // Note: cpanm installation would happen here if available
          this.logger.debug('✅ Perl environment configured');
        } catch (error) {
          this.logger.warn('Failed to configure Perl environment:', error);
        }
      });
    }

    // Run all package installations in parallel with limited concurrency
    const concurrentInstalls = 3; // Install 3 languages at a time to avoid overwhelming the system
    for (let i = 0; i < installOperations.length; i += concurrentInstalls) {
      const batch = installOperations.slice(i, i + concurrentInstalls);
      await Promise.allSettled(batch.map(op => op()));
    }

    this.logger.info(`✅ Package installation completed for ${installOperations.length} language environments`);
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

      // Get the language-specific virtual environment path
      const languageVenvPath = this.venvCache.get(language);
      
      // Determine execution command and environment based on language with virtual environments
      const getCommandAndEnv = () => {
        const fileName = path.basename(filePath);
        const fileNameWithoutExt = path.basename(filePath, path.extname(filePath));
        
        switch (language) {
          case 'python':
            if (!languageVenvPath) {
              return { command: ['python3', filePath], cwd: session.workspaceDir, env: process.env };
            }
            return {
              command: [`${languageVenvPath}/bin/python`, filePath],
              cwd: session.workspaceDir,
              env: {
                ...process.env,
                PATH: `${languageVenvPath}/bin:${process.env.PATH}`,
                VIRTUAL_ENV: languageVenvPath
              }
            };
          
          case 'javascript':
            return {
              command: ['node', filePath],
              cwd: session.workspaceDir,
              env: languageVenvPath ? {
                ...process.env,
                NODE_PATH: `${languageVenvPath}/node_modules`,
                PATH: `${languageVenvPath}/node_modules/.bin:${process.env.PATH}`
              } : process.env
            };
          
          case 'typescript':
            if (languageVenvPath) {
              const tsFilePath = path.join(languageVenvPath, fileName);
              return {
                command: ['bash', '-c', `cp "${filePath}" "${tsFilePath}" && cd "${languageVenvPath}" && npx ts-node "${fileName}"`],
                cwd: languageVenvPath,
                env: {
                  ...process.env,
                  NODE_PATH: `${languageVenvPath}/node_modules`,
                  PATH: `${languageVenvPath}/node_modules/.bin:${process.env.PATH}`
                }
              };
            }
            return { command: ['ts-node', filePath], cwd: session.workspaceDir, env: process.env };
          
          case 'java':
            const className = fileNameWithoutExt;
            if (languageVenvPath) {
              const javaFilePath = path.join(languageVenvPath, 'src', fileName);
              return {
                command: ['bash', '-c', `mkdir -p "${path.dirname(javaFilePath)}" && cp "${filePath}" "${javaFilePath}" && cd "${languageVenvPath}" && javac -d build src/${fileName} && java -cp build ${className}`],
                cwd: languageVenvPath,
                env: {
                  ...process.env,
                  CLASSPATH: `${languageVenvPath}/lib/*:${languageVenvPath}/build`
                }
              };
            }
            return {
              command: ['bash', '-c', `cd ${path.dirname(filePath)} && javac ${path.basename(filePath)} && java ${className}`],
              cwd: session.workspaceDir,
              env: process.env
            };
          
          case 'rust':
            if (languageVenvPath) {
              const rustFilePath = path.join(languageVenvPath, 'src', 'main.rs');
              return {
                command: ['bash', '-c', `cp "${filePath}" "${rustFilePath}" && cd "${languageVenvPath}" && CARGO_HOME="${languageVenvPath}/.cargo" cargo run --quiet`],
                cwd: languageVenvPath,
                env: {
                  ...process.env,
                  CARGO_HOME: `${languageVenvPath}/.cargo`
                }
              };
            }
            return {
              command: ['bash', '-c', `cd ${path.dirname(filePath)} && rustc ${path.basename(filePath)} -o ${fileNameWithoutExt} && ./${fileNameWithoutExt}`],
              cwd: session.workspaceDir,
              env: process.env
            };
          
          case 'go':
            if (languageVenvPath) {
              const goFilePath = path.join(languageVenvPath, 'main.go');
              return {
                command: ['bash', '-c', `cp "${filePath}" "${goFilePath}" && cd "${languageVenvPath}" && go run main.go`],
                cwd: languageVenvPath,
                env: {
                  ...process.env,
                  GOPATH: `${languageVenvPath}/gopath`
                }
              };
            }
            return { command: ['go', 'run', filePath], cwd: session.workspaceDir, env: process.env };
          
          case 'c':
          case 'cpp':
            const compiler = language === 'c' ? 'gcc' : 'g++';
            if (languageVenvPath) {
              const srcFilePath = path.join(languageVenvPath, 'src', fileName);
              return {
                command: ['bash', '-c', `mkdir -p "${path.dirname(srcFilePath)}" && cp "${filePath}" "${srcFilePath}" && cd "${languageVenvPath}" && ${compiler} src/${fileName} -o build/${fileNameWithoutExt} && ./build/${fileNameWithoutExt}`],
                cwd: languageVenvPath,
                env: process.env
              };
            }
            return {
              command: ['bash', '-c', `cd ${path.dirname(filePath)} && ${compiler} ${path.basename(filePath)} -o ${fileNameWithoutExt} && ./${fileNameWithoutExt}`],
              cwd: session.workspaceDir,
              env: process.env
            };
          
          default:
            throw new Error(`Execution not implemented for language: ${language}`);
        }
      };

      try {
        const { command, cwd, env } = getCommandAndEnv();
        const [commandName, ...args] = command;
        childProcess = spawn(commandName, args, {
          cwd,
          env,
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
