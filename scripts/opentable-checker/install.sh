#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLIST_NAME="com.mise-en-place.opentable-checker.plist"
PLIST_SRC="$SCRIPT_DIR/$PLIST_NAME"
PLIST_DEST="$HOME/Library/LaunchAgents/$PLIST_NAME"
NODE_PATH="$(which node)"

echo "Setting up OpenTable checker..."
echo "  Script dir: $SCRIPT_DIR"
echo "  Node path:  $NODE_PATH"

# Install dependencies if needed
if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
  echo "Installing dependencies..."
  cd "$SCRIPT_DIR" && npm install && npx playwright install chromium
fi

# Check .env exists
if [ ! -f "$SCRIPT_DIR/.env" ]; then
  echo "ERROR: $SCRIPT_DIR/.env not found. Copy .env.example and fill in values."
  exit 1
fi

# Generate plist with correct paths
sed -e "s|__SCRIPT_DIR__|$SCRIPT_DIR|g" \
    -e "s|/usr/local/bin/node|$NODE_PATH|g" \
    "$PLIST_SRC" > "$PLIST_DEST"

# Load the agent
launchctl unload "$PLIST_DEST" 2>/dev/null || true
launchctl load "$PLIST_DEST"

echo "Done! OpenTable checker will run every 5 minutes."
echo "  Logs: $SCRIPT_DIR/checker.log"
echo "  Stop: launchctl unload $PLIST_DEST"
echo "  Start: launchctl load $PLIST_DEST"
