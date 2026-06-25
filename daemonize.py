#!/usr/bin/env python3
"""Daemon wrapper to fully detach a child process from the calling shell.

Usage: python3 daemonize.py <command> [args...]

The child runs in a new session, with all stdio redirected to /home/z/my-project/dev.log.
This survives parent shell exit because we double-fork and become a child of PID 1.
"""
import os
import sys
import subprocess


def main():
    if len(sys.argv) < 2:
        print("Usage: daemonize.py <command> [args...]", file=sys.stderr)
        sys.exit(2)

    cmd = sys.argv[1:]
    log_path = "/home/z/my-project/dev.log"

    # First fork
    pid = os.fork()
    if pid > 0:
        # Parent: exit immediately
        sys.exit(0)

    # Decouple from parent environment
    os.setsid()
    os.umask(0)

    # Second fork
    pid = os.fork()
    if pid > 0:
        sys.exit(0)

    # Now we're the daemon child, reparented to init
    # Redirect stdio
    sys.stdout.flush()
    sys.stderr.flush()
    with open("/dev/null", "rb") as devnull_in:
        os.dup2(devnull_in.fileno(), 0)
    with open(log_path, "ab") as logfile:
        os.dup2(logfile.fileno(), 1)
        os.dup2(logfile.fileno(), 2)

    # Set env
    env = os.environ.copy()
    env["PATH"] = "/home/z/my-project/node_modules/.bin:" + env.get("PATH", "")
    env["NODE_OPTIONS"] = "--max-old-space-size=2048"

    # Exec the command
    os.execvpe(cmd[0], cmd, env)


if __name__ == "__main__":
    main()
