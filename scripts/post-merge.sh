#!/bin/bash
set -e

echo "Running post-merge deployment hook..."

# 1. Install dependencies
if command -v pnpm &> /dev/null; then
  pnpm install --frozen-lockfile
else
  npm install
fi

# 2. Build backend and frontend bundles
if command -v pnpm &> /dev/null; then
  pnpm run build
else
  npm run build
fi

echo "Post-merge deployment complete."
