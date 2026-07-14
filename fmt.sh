#!/bin/sh
set -e pipefail

# Check pnpm
if ! command -v pnpm >/dev/null 2>&1; then
    echo "[ERROR] pnpm not found. Install it first: npm install -g pnpm" >&2
    exit 1
fi

# Check node_modules
if [ ! -d "node_modules" ]; then
    echo "[WARN] node_modules not found. Running pnpm install..." >&2
    pnpm install || { echo "[ERROR] pnpm install failed" >&2; exit 1; }
fi

# Run formatter
echo "[INFO] Running prettier ..."
pnpm format
echo "[OK] Formatting complete"
