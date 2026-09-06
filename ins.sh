#!/bin/sh
set -e

# Build
echo "[INFO] Building..."
pnpm build

# Pack
echo "[INFO] Packing..."
TGZ=$(npm pack 2>/dev/null | tail -1)

# Install globally from the tarball (instead of symlink via npm i -g .)
echo "[INFO] Installing $TGZ globally..."
npm i -g "./$TGZ"

# Cleanup tarball
rm -f "$TGZ"

echo "[OK] grc installed. Run: grc --help"
