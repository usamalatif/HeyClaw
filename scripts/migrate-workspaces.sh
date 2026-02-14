#!/bin/bash
# Update existing user workspaces with new template files
# Run this AFTER docker compose up

set -e

echo "=== HeyClaw Workspace Migration ==="

# Run inside API container which has templates
docker exec heyclaw-api sh -c '
  WORKSPACES_DIR="/openclaw-workspaces"
  TEMPLATES_DIR="/app/templates"

  if [ ! -d "$WORKSPACES_DIR" ]; then
    echo "No workspaces directory found"
    exit 0
  fi

  updated=0
  for workspace in "$WORKSPACES_DIR"/agent-*; do
    if [ -d "$workspace" ]; then
      agent_id=$(basename "$workspace")
      echo "Updating: $agent_id"

      # Update AGENTS.md (main instructions)
      if [ -f "$TEMPLATES_DIR/AGENTS.md" ]; then
        cp "$TEMPLATES_DIR/AGENTS.md" "$workspace/AGENTS.md"
      fi

      # Add USER.md if missing or update template markers
      if [ -f "$TEMPLATES_DIR/USER.md" ]; then
        if [ ! -f "$workspace/USER.md" ] || grep -q "update when they tell you" "$workspace/USER.md" 2>/dev/null; then
          # Only update if file is missing or still has template markers (not personalized)
          if [ ! -f "$workspace/USER.md" ]; then
            cp "$TEMPLATES_DIR/USER.md" "$workspace/USER.md"
          fi
        fi
      fi

      # Add IDENTITY.md if missing
      if [ ! -f "$workspace/IDENTITY.md" ] && [ -f "$TEMPLATES_DIR/IDENTITY.md" ]; then
        cp "$TEMPLATES_DIR/IDENTITY.md" "$workspace/IDENTITY.md"
      fi

      # Add TOOLS.md if missing
      if [ ! -f "$workspace/TOOLS.md" ] && [ -f "$TEMPLATES_DIR/TOOLS.md" ]; then
        cp "$TEMPLATES_DIR/TOOLS.md" "$workspace/TOOLS.md"
      fi

      # Add HEARTBEAT.md if missing
      if [ ! -f "$workspace/HEARTBEAT.md" ] && [ -f "$TEMPLATES_DIR/HEARTBEAT.md" ]; then
        cp "$TEMPLATES_DIR/HEARTBEAT.md" "$workspace/HEARTBEAT.md"
      fi

      # Create memory folder if missing
      if [ ! -d "$workspace/memory" ]; then
        mkdir -p "$workspace/memory"
      fi

      updated=$((updated + 1))
    fi
  done

  echo ""
  echo "Updated $updated workspaces"
'

echo ""
echo "=== Workspace Migration Complete ==="
echo "Updated files:"
echo "  ✓ AGENTS.md (memory instructions)"
echo "  ✓ USER.md (if missing)"
echo "  ✓ IDENTITY.md (if missing)"
echo "  ✓ TOOLS.md (if missing)"
echo "  ✓ HEARTBEAT.md (if missing)"
echo "  ✓ memory/ folder (if missing)"
