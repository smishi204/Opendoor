#!/bin/bash
set -e

# Opendoor MCP Server Complete Edition Entrypoint
echo "🚀 Opendoor MCP Server Complete Edition Starting..."
echo "📅 $(date)"
echo "🏗️  Environment: $NODE_ENV"
echo "🚪 Transport: $MCP_TRANSPORT"
echo "🌐 Host: $HOST:$PORT"

# Function to wait for service with enhanced logging
wait_for_service() {
    local service=$1
    local port=$2
    local timeout=${3:-30}
    
    echo "⏳ Waiting for $service on port $port..."
    for i in $(seq 1 $timeout); do
        if nc -z localhost $port 2>/dev/null; then
            echo "✅ $service is ready!"
            return 0
        fi
        if [ $((i % 5)) -eq 0 ]; then
            echo "   Still waiting for $service... ($i/$timeout)"
        fi
        sleep 1
    done
    echo "❌ Timeout waiting for $service after $timeout seconds"
    return 1
}

# Function to check system requirements for local execution
check_system_requirements() {
    echo "🔧 Checking system requirements for local execution..."
    
    # Check Python
    if command -v python3 >/dev/null 2>&1; then
        PYTHON_VERSION=$(python3 --version)
        echo "✅ Python available: $PYTHON_VERSION"
    else
        echo "⚠️  Python3 not found"
        return 1
    fi
    
    # Check Node.js
    if command -v node >/dev/null 2>&1; then
        NODE_VERSION=$(node --version)
        echo "✅ Node.js available: $NODE_VERSION"
    else
        echo "❌ Node.js not found"
        return 1
    fi
    
    # Check Java
    if command -v java >/dev/null 2>&1; then
        JAVA_VERSION=$(java -version 2>&1 | head -1)
        echo "✅ Java available: $JAVA_VERSION"
    else
        echo "⚠️  Java not found (some code execution features will be limited)"
    fi
    
    # Check Go
    if command -v go >/dev/null 2>&1; then
        GO_VERSION=$(go version)
        echo "✅ Go available: $GO_VERSION"
    else
        echo "⚠️  Go not found (Go code execution will be limited)"
    fi
    
    # Check essential tools
    for tool in gcc g++ make curl wget; do
        if command -v $tool >/dev/null 2>&1; then
            echo "✅ $tool available"
        else
            echo "⚠️  $tool not found"
        fi
    done
    
    echo "✅ System requirements check completed"
    return 0
}

# Function to initialize directories and permissions
initialize_environment() {
    echo "🔧 Initializing environment..."
    
    # Create necessary directories if they don't exist
    mkdir -p \
        /app/logs \
        /app/sessions \
        /app/venvs \
        /app/temp \
        /tmp/mcp-sessions \
        /var/log/mcp
    
    # Set proper permissions
    chmod 755 /app/logs /app/sessions /app/venvs /app/temp
    chmod 777 /tmp/mcp-sessions
    
    echo "✅ Environment initialized"
}

# Function to validate MCP server configuration
validate_configuration() {
    echo "🔍 Validating MCP server configuration..."
    
    # Check if built files exist
    if [ ! -f "/app/dist/index.js" ]; then
        echo "❌ Built application not found at /app/dist/index.js"
        return 1
    fi
    
    # Check if package.json exists
    if [ ! -f "/app/package.json" ]; then
        echo "❌ package.json not found"
        return 1
    fi
    
    # Check Node.js version
    NODE_VERSION=$(node --version)
    echo "✅ Node.js version: $NODE_VERSION"
    
    # Check if required environment variables are set
    if [ -z "$MCP_TRANSPORT" ]; then
        echo "⚠️  MCP_TRANSPORT not set, defaulting to 'sse'"
        export MCP_TRANSPORT=sse
    fi
    
    if [ -z "$PORT" ]; then
        echo "⚠️  PORT not set, defaulting to 3000"
        export PORT=3000
    fi
    
    echo "✅ Configuration validated"
}

# Function to start services with proper error handling
start_services() {
    echo "🚀 Starting services..."
    
    # Start supervisor in background
    echo "📊 Starting supervisor..."
    supervisord -c /etc/supervisor/conf.d/supervisord.conf &
    SUPERVISOR_PID=$!
    
    # Give supervisor time to start
    sleep 5
    
    # Check if supervisor is running
    if ! kill -0 $SUPERVISOR_PID 2>/dev/null; then
        echo "❌ Supervisor failed to start"
        return 1
    fi
    
    echo "✅ Supervisor started with PID $SUPERVISOR_PID"
    return 0
}

# Function to perform health checks
perform_health_checks() {
    echo "🏥 Performing health checks..."
    
    # Wait for Redis to be ready
    if wait_for_service "Redis" 6379 60; then
        # Test Redis connection
        if redis-cli -p 6379 ping | grep -q PONG; then
            echo "✅ Redis is responding to ping"
        else
            echo "⚠️  Redis is listening but not responding to ping"
        fi
    else
        echo "❌ Redis failed to start"
        return 1
    fi
    
    # Wait for MCP server to be ready
    if wait_for_service "MCP Server" $PORT 120; then
        # Test MCP server health endpoint
        sleep 5  # Give it a moment to fully initialize
        if curl -f http://localhost:$PORT/health >/dev/null 2>&1; then
            echo "✅ MCP Server health endpoint is responding"
        else
            echo "⚠️  MCP Server is listening but health endpoint not ready yet"
        fi
    else
        echo "❌ MCP Server failed to start"
        return 1
    fi
    
    echo "✅ All health checks completed"
}

# Function to display startup summary
display_startup_summary() {
    echo ""
    echo "🎉 Opendoor MCP Server Complete Edition is ready!"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📍 MCP Server: http://localhost:$PORT"
    echo "🌐 Web Interface: http://localhost:${WEB_PORT:-3001}"
    echo "🔌 Transport: $MCP_TRANSPORT"
    echo "💾 Redis: localhost:6379"
    echo "📊 Health Check: http://localhost:$PORT/health"
    echo "📋 Logs: /var/log/supervisor/ and /var/log/mcp/"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "🛠️  Available Tools:"
    echo "   • execute_code - Local multi-language code execution (Python, Node.js, Java, Go, Rust, C/C++)"
    echo "   • create_vscode_session - Local VS Code development environments"
    echo "   • create_playwright_session - Local browser automation"
    echo "   • manage_sessions - Session management"
    echo "   • system_health - System monitoring"
    echo ""
    echo "📚 Available Resources:"
    echo "   • system_config - Server configuration"
    echo "   • usage_guide - Usage instructions"
    echo ""
    echo "🔒 Security: Rate limiting and input validation enabled"
    echo "📈 Monitoring: Health checks and logging active"
    echo ""
}

# Main execution flow
main() {
    # Initialize environment
    initialize_environment
    
    # Validate configuration
    validate_configuration
    
    # Check system requirements
    check_system_requirements || echo "⚠️  Some system requirements missing - some features may be limited"
    
    # Start services
    if ! start_services; then
        echo "❌ Failed to start services"
        exit 1
    fi
    
    # Perform health checks
    if ! perform_health_checks; then
        echo "❌ Health checks failed"
        # Show logs for debugging
        echo "📋 Recent supervisor logs:"
        tail -20 /var/log/supervisor/supervisord.log 2>/dev/null || echo "No supervisor logs available"
        echo "📋 Recent MCP server logs:"
        tail -20 /var/log/supervisor/mcp-server.err.log 2>/dev/null || echo "No MCP server logs available"
        exit 1
    fi
    
    # Display startup summary
    display_startup_summary
    
    # Keep the container running and monitor services
    echo "🔄 Monitoring services... (Press Ctrl+C to stop)"
    
    # Wait for supervisor process
    wait $SUPERVISOR_PID
}

# Handle signals gracefully
trap 'echo "🛑 Received shutdown signal, stopping services..."; kill $SUPERVISOR_PID 2>/dev/null; exit 0' SIGTERM SIGINT

# Run main function
main