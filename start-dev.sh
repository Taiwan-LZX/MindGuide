#!/bin/bash
# MindGuide dev server launcher
# Fully detached: survives parent shell exit
cd /home/z/my-project
exec bun next dev -p 3000 > /home/z/my-project/dev.log 2>&1
