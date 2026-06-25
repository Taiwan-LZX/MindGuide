#!/usr/bin/env python3
"""Daemon wrapper to fully detach a child process from the calling shell,
with optional built-in watchdog auto-restart for the Next.js dev server.

Usage:
  python3 daemonize.py next dev -p 3000           # one-shot start
  python3 daemonize.py --watch next dev -p 3000   # with watchdog auto-restart

The dev server is started as a daemonized grandchild of init (PID 1) via
double-fork. This is necessary because nohup/setsid/disown cannot survive
parent shell exit in this sandbox (the entire process group gets SIGKILL'd).

When --watch is given, a separate watchdog daemon monitors the dev server
and restarts it if the process dies or HTTP health checks fail repeatedly.
"""
import os
import sys
import subprocess
import time
import urllib.request


WATCHDOG_HEALTH_URL = "http://localhost:3000/"
WATCHDOG_INTERVAL_SEC = 10
WATCHDOG_MAX_FAILURES = 3
DEV_LOG_PATH = "/home/z/my-project/dev.log"
WATCHDOG_LOG_PATH = "/tmp/mindguide/watchdog.log"


def write_log(message):
    try:
        os.makedirs(os.path.dirname(WATCHDOG_LOG_PATH), exist_ok=True)
        with open(WATCHDOG_LOG_PATH, "a") as f:
            f.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {message}\n")
    except Exception:
        pass


def is_server_healthy():
    try:
        req = urllib.request.Request(WATCHDOG_HEALTH_URL, method="HEAD")
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
    """Kill any running next dev / next-server processes."""
    try:
        subprocess.run(["pkill", "-9", "-f", "next-server"], capture_output=True, timeout=5)
        subprocess.run(["pkill", "-9", "-f", "next dev"], capture_output=True, timeout=5)
        time.sleep(1)
    except Exception as e:
        write_log(f"kill_dev_server error: {e}")


def daemonize_self():
    """Double-fork the current process to become a true daemon (reparented to init)."""
    # First fork
    pid = os.fork()
    if pid > 0:
        # Parent exits immediately
        sys.exit(0)

    # Child: become session leader, drop controlling terminal
    os.setsid()
    os.umask(0)

    # Second fork (so we can never reacquire a controlling terminal)
    pid = os.fork()
    if pid > 0:
        sys.exit(0)

    # Grandchild: now reparented to init. Redirect stdio.
    sys.stdout.flush()
    sys.stderr.flush()
    with open("/dev/null", "rb") as devnull_in:
        os.dup2(devnull_in.fileno(), 0)
    with open("/dev/null", "wb") as devnull_out:
        os.dup2(devnull_out.fileno(), 1)
        os.dup2(devnull_out.fileno(), 2)


def start_dev_server_detached(cmd, env, log_path):
    """Start the dev server as a fully-detached daemon grandchild. Returns immediately.

    The dev server will write its stdout/stderr to log_path. We use double-fork
    so it survives the calling shell's exit (reparented to init).
    """
    pid = os.fork()
    if pid > 0:
        # Parent: wait briefly then return
        time.sleep(0.1)
        return

    # Child: become session leader
    os.setsid()
    os.umask(0)

    # Second fork
    pid = os.fork()
    if pid > 0:
        os._exit(0)

    # Grandchild: redirect stdio to dev.log (truncate for fresh log)
    sys.stdout.flush()
    sys.stderr.flush()
    with open("/dev/null", "rb") as devnull_in:
        os.dup2(devnull_in.fileno(), 0)
    with open(log_path, "wb") as logfile:
        os.dup2(logfile.fileno(), 1)
        os.dup2(logfile.fileno(), 2)

    # Exec the command (replaces this process)
    os.execvpe(cmd[0], cmd, env)


def watchdog_loop(cmd, env, log_path):
    """Monitor dev server health and restart if needed."""
    write_log(f"Watchdog started (monitoring {WATCHDOG_HEALTH_URL})")

    # Initial startup grace period
    time.sleep(15)

    consecutive_failures = 0
    while True:
        pid = find_dev_server_pid()
        if pid is None:
            write_log("Dev server process not found, restarting...")
            kill_dev_server()
            start_dev_server_detached(cmd, env, log_path)
            time.sleep(15)
            consecutive_failures = 0
            continue

        if is_server_healthy():
            consecutive_failures = 0
        else:
            consecutive_failures += 1
            write_log(f"Health check failed ({consecutive_failures}/{WATCHDOG_MAX_FAILURES})")
            if consecutive_failures >= WATCHDOG_MAX_FAILURES:
                write_log("Max failures reached, force restarting dev server...")
                kill_dev_server()
                start_dev_server_detached(cmd, env, log_path)
                time.sleep(15)
                consecutive_failures = 0

        time.sleep(WATCHDOG_INTERVAL_SEC)


def main():
    if len(sys.argv) < 2:
        print("Usage: daemonize.py [--watch] <command> [args...]", file=sys.stderr)
        sys.exit(2)

    watch_mode = False
    args = sys.argv[1:]
    if args and args[0] == "--watch":
        watch_mode = True
        args = args[1:]

    if not args:
        print("Usage: daemonize.py [--watch] <command> [args...]", file=sys.stderr)
        sys.exit(2)

    cmd = args
    env = os.environ.copy()
    env["PATH"] = "/home/z/my-project/node_modules/.bin:" + env.get("PATH", "")
    env["NODE_OPTIONS"] = "--max-old-space-size=2048"

    # Kill any stale dev server first
    kill_dev_server()

    if watch_mode:
        # Daemonize ourselves (the watchdog), then start dev server + monitor
        daemonize_self()
        start_dev_server_detached(cmd, env, DEV_LOG_PATH)
        watchdog_loop(cmd, env, DEV_LOG_PATH)
    else:
        # Non-watch: just start the dev server detached and exit
        start_dev_server_detached(cmd, env, DEV_LOG_PATH)


if __name__ == "__main__":
    main()
