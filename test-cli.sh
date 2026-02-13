#!/bin/bash
if [ -f test/cliCommands.test.js ]; then
  npm run build && node --test test/cliCommands.test.js
else
  echo "cliCommands.test.js not found (skipping CLI tests)"
  exit 0
fi
