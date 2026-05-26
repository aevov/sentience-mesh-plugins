#!/bin/bash
# Quantum Cloud Container Image Builder
# Builds all production-ready deployment stacks

set -e

echo "═══════════════════════════════════════════════════════"
echo "  🚀 Quantum Cloud - Container Image Builder"
echo "═══════════════════════════════════════════════════════"
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/container-images"

STACKS=("ubuntu" "devbox" "nodestack" "webstack" "dockerhost" "cyberpanel")

for stack in "${STACKS[@]}"; do
    echo "📦 Building cr8os/${stack}:latest..."
    if [ -d "$stack" ]; then
        podman build \
            --tag "cr8os/${stack}:latest" \
            --file "${stack}/Dockerfile" \
            "${stack}/"
        echo "   ✅ Built cr8os/${stack}:latest"
    else
        echo "   ⚠️  Directory ${stack}/ not found, skipping..."
    fi
    echo ""
done

echo "═══════════════════════════════════════════════════════"
echo "  ✅ Build Complete!"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "Available images:"
podman images | grep "cr8os/" || echo "No cr8os images found"
echo ""
