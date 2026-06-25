#!/usr/bin/env python3
"""Standalone watchdog daemon for the MindGuide dev server.

Runs in the background, monitors http://localhost:3000/ every 10s,
and restarts the dev server (via nohup) if it crashes or becomes unresponsive.

Usage:
  python3 /home/z/my-project/watchdog.py &

This script self-daemonizes via double-fork so it survives the calling shell's exit.
"""
import os
import sys
import subprocess
import time
import urllib.request


HEALTH_URL = "http://localhost:3000/"
CHECK_INTERVAL_SEC = 10
MAX_FAILURES = 3
STARTUP_GRACE_SEC = 15
DEV_LOG_PATH = "/home/z/my-project/dev.log"
WATCHDOG_LOG_PATH = "/tmp/mindguide/watchdog.log"
PROJECT_DIR = "/home/z/my-project"


def write_log(message):
    try:
        os.makedirs(os.path.dirname(WATCHDOG_LOG_PATH), exist_ok=True)
        with open(WATCHDOG_LOG_PATH, "a") as f:
            f.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {message}\n")
    except Exception:
        pass


def is_healthy():
    try:
        req = urllib.request.Request(HEALTH_URL, method="HEAD")
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status < 500
    except Exception:
        return False


def find_dev_server_pid():
    """Find the running next-server PID by scanning /proc."""
    try:
        for entry in os.listdir("/proc"):
            if not entry.isdigit():
                continue
            pid = int(entry)
            try:
                with open(f"/proc/{pid}/cmdline", "rb") as f:
                    cmdline = f.read().decode("utf-8", errors="replace")
                if "next-server" in cmdline:
                    return pid
            except (ProcessLookupError, PermissionError, OSError):
                continue
    except Exception:
        pass
    return None


def kill_dev_server():
    try:
        subprocess.run(["pkill", "-9", "-f", "next-server"], capture_output=True, timeout=5)
        subprocess.run(["pkill", "-9", "-f", "next dev"], capture_output=True, timeout=5)
        time.sleep(1)
    except Exception as e:
        write_log(f"kill_dev_server error: {e}")


def start_dev_server():
    """Start the dev server detached via nohup."""
    env = os.environ.copy()
    env["PATH"] = f"{PROJECT_DIR}/node_modules/.bin:" + env.get("PATH", "")
    env["NODE_OPTIONS"] = "--max-old-space-size=2048"
    # Detach completely: new session, stdio to dev.log
    subprocess.Popen(
        ["next", "dev", "-p", "3000"],
        cwd=PROJECT_DIR,
        env=env,
        stdin=subprocess.DEVNULL,
        stdout=open(DEV_LOG_PATH, "wb"),
        stderr=subprocess.STDOUT,
        start_new_session=True,  # equivalent to setsid
    )


def daemonize():
    """Double-fork to become a true daemon (reparented to init)."""
    pid = os.fork()
    if pid > 0:
        sys.exit(0)
    os.setsid()
    os.umask(0)
    pid = os.fork()
    if pid > 0:
        sys.exit(0)
    # Redirect stdio to /dev/null
    sys.stdout.flush()
    sys.stderr.flush()
    with open("/dev/null", "rb") as devnull_in:
        os.dup2(devnull_in.fileno(), 0)
    with open("/dev/null", "wb") as devnull_out:
        os.dup2(devnull_out.fileno(), 1)
        os.dup2(devnull_out.fileno(), 2)


def main():
    daemonize()
    write_log("Watchdog daemon started")
    # Initial grace period
    time.sleep(STARTUP_GRACE_SEC)

    consecutive_failures = 0
    while True:
        pid = find_dev_server_pid()
        if pid is None:
            write_log("Dev server not found, starting...")
            kill_dev_server()
            start_dev_server()
            time.sleep(STARTUP_GRACE_SEC)
            consecutive_failures = 0
            continue

        if is_healthy():
            consecutive_failures = 0
        else:
            consecutive_failures += 1
            write_log(f"Health check failed ({consecutive_failures}/{MAX_FAILURES})")
            if consecutive_failures >= MAX_FAILURES:
                write_log("Max failures reached, force restarting dev server...")
                kill_dev_server()
                start_dev_server()
                time.sleep(STARTUP_GRACE_SEC)
                consecutive_failures = 0

        time.sleep(CHECK_INTERVAL_SEC)


if __name__ == "__main__":
    main()
