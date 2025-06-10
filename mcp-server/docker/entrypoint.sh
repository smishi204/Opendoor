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

# Function to check Docker availability
check_docker() {
    echo "🐳 Checking Docker availability..."
    
    if [ -S /var/run/docker.sock ]; then
        echo "✅ Docker socket is available at /var/run/docker.sock"
        
        # Try to test Docker connection
        if timeout 10 docker version >/dev/null 2>&1; then
            echo "✅ Docker is accessible and working!"
            docker version | head -3
            return 0
        else
            echo "⚠️  Docker socket exists but not accessible (this may be normal in some environments)"
            return 1
        fi
    else
        echo "⚠️  Docker socket not found (this is normal for testing without Docker)"
        return 1
    fi
}

# Function to initialize directories and permissions
initialize_environment() {
    echo "🔧 Initializing environment..."
    
    # Create necessary directories if they don't exist
    mkdir -p \
        /app/logs \
        /app/sessions \
        /app/temp \
        /tmp/mcp-sessions \
        /tmp/mcp-containers \
        /var/log/mcp
    
    # Set proper permissions
    chmod 755 /app/logs /app/sessions /app/temp
    chmod 777 /tmp/mcp-sessions /tmp/mcp-containers
    
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
    echo "   • execute_code - Multi-language code execution"
    echo "   • create_vscode_session - VS Code development environments"
    echo "   • create_playwright_session - Browser automation"
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
    
    # Check Docker availability
    check_docker || echo "⚠️  Docker not available - some features may be limited"
    
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