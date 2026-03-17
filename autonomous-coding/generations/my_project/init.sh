#!/bin/bash
set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== Digital Human AI Companion Setup ==="
echo "Project: $PROJECT_DIR"

# Install server dependencies
echo ""
echo "[1/4] Installing server dependencies..."
cd "$PROJECT_DIR/server"
npm install --silent

# Install client dependencies
echo "[2/4] Installing client dependencies..."
cd "$PROJECT_DIR/client"
npm install --silent

# Create data directory for SQLite
echo "[3/4] Creating data directory..."
mkdir -p "$PROJECT_DIR/server/data"

# Copy .env if it doesn't exist
if [ ! -f "$PROJECT_DIR/.env" ]; then
  echo "[4/4] .env already exists, skipping."
else
  echo "[4/4] .env found."
fi

echo ""
echo "=== Setup complete! ==="
echo ""
echo "To start the app, run both of these commands (in separate terminals):"
echo "  cd server && node index.js"
echo "  cd client && npx vite"
echo ""
echo "Or use:"
echo "  ./start.sh"
