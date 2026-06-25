#!/bin/bash
# MindGuide Dev Server Keep-Alive Script
# Automatically restarts the dev server if it crashes or gets killed
# Usage: bash keep-server.sh &

cd /home/z/my-project

# Cleanup stale Chrome/agent-browser processes that eat memory
cleanup_chrome() {
  pkill -9 -f "chrome" 2>/dev/null
  pkill -9 -f "agent-browser" 2>/dev/null
}

# Kill any existing dev server
pkill -f "next dev" 2>/dev/null
pkill -f "next-server" 2>/dev/null
sleep 1
cleanup_chrome
sleep 1

# Create log directory
mkdir -p /tmp/mindguide

# Make sure local node_modules bin is on PATH
export PATH="/home/z/my-project/node_modules/.bin:$PATH"

# Function to check if dev server is responsive
check_health() {
  curl -s -o /dev/null --max-time 3 http://localhost:3000/ 2>/dev/null
  return $?
}

# Function to start a fresh dev server in the background
start_dev() {
  # Start dev server in a new session, fully detached
  setsid bash -c 'NODE_OPTIONS="--max-old-space-size=2048" exec next dev -p 3000' < /dev/null > /home/z/my-project/dev.log 2>&1 &
  DEV_PID=$!
  echo "[$(date '+%H:%M:%S')] Started dev server (PID $DEV_PID)" >> /tmp/mindguide/server.log
}

# Function to kill the dev server (entire process tree)
kill_dev() {
  pkill -9 -f "next dev" 2>/dev/null
  pkill -9 -f "next-server" 2>/dev/null
  sleep 1
}

# Main loop: monitor and restart
start_dev
sleep 8  # initial startup time

while true; do
  # Check if dev server is alive (process exists AND port responds)
  if ! pgrep -f "next-server" > /dev/null; then
    echo "[$(date '+%H:%M:%S')] next-server process not found, restarting..." >> /tmp/mindguide/server.log
    kill_dev
    start_dev
    sleep 8
    continue
  fi

  # Check health every 5 seconds
  if ! check_health; then
    echo "[$(date '+%H:%M:%S')] Health check failed, restarting..." >> /tmp/mindguide/server.log
    kill_dev
    start_dev
    sleep 8
    continue
  fi

  sleep 5
done
