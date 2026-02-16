#!/bin/bash
# Migrate existing agents to use browser instead of web_search

WORKSPACES_DIR="${1:-/root/.openclaw/workspaces}"

BROWSER_SECTION='## 🌐 Web Search — Use Browser!

When you need to search the web, **use the `browser` tool**, NOT `web_search`:

1. Open Google: `browser action=open targetUrl="https://www.google.com/search?q=YOUR+QUERY"`
2. Take a snapshot: `browser action=snapshot` to read the results
3. Click links if needed for more details

**Example flow:**
```
User: "What'"'"'s trending in AI today?"
You: Use browser to search Google, read results, summarize
```

**DO NOT use `web_search`** — it requires an API key we don'"'"'t have.

'

echo "Migrating agents in: $WORKSPACES_DIR"

for agent_dir in "$WORKSPACES_DIR"/agent-*; do
    if [ -d "$agent_dir" ]; then
        agents_file="$agent_dir/AGENTS.md"
        if [ -f "$agents_file" ]; then
            # Check if already migrated
            if grep -q "Use Browser" "$agents_file"; then
                echo "  ✓ $(basename $agent_dir) - already migrated"
            else
                # Insert browser section before ## Guidelines
                sed -i.bak 's/## Guidelines/'"$BROWSER_SECTION"'## Guidelines/' "$agents_file"
                rm -f "${agents_file}.bak"
                echo "  ✅ $(basename $agent_dir) - migrated!"
            fi
        fi
    fi
done

echo "Done!"
