#!/bin/bash
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== Starting Digital Human AI Companion ==="

# Load environment variables
if [ -f "$PROJECT_DIR/.env" ]; then
  export $(grep -v '^#' "$PROJECT_DIR/.env" | xargs)
fi

# Start server in background
echo "Starting server on port 3000..."
cd "$PROJECT_DIR/server"
node index.js &
SERVER_PID=$!

# Wait for server to start
sleep 2

# Start client
echo "Starting client on port 5173..."
cd "$PROJECT_DIR/client"
npx vite &
CLIENT_PID=$!

echo ""
echo "Server: http://localhost:3000"
echo "Client: http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop both servers"

# Cleanup on exit
trap "kill $SERVER_PID $CLIENT_PID 2>/dev/null" EXIT

wait
