#!/usr/bin/env bash
# spawn_director.sh
# Launches a new Claude Code director session with full inherited context.
# Run this when the current director's context is running low.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTEXT_FILE="$SCRIPT_DIR/DIRECTOR_CONTEXT.md"
PROJECT_DIR="$SCRIPT_DIR/generations/my_project"

echo "=== Director Handoff ==="
echo

# Update context file with latest progress before handing off
echo "Updating context with latest progress..."
source "$SCRIPT_DIR/.venv/bin/activate"
python3 - <<'EOF'
import json
from pathlib import Path
from datetime import datetime

project = Path("generations/my_project")
data = json.loads((project / "feature_list.json").read_text())
features = data["features"]
passing = [f for f in features if f.get("passes")]
failing = [f for f in features if not f.get("passes")]

# Update the timestamp line in DIRECTOR_CONTEXT.md
ctx = Path("DIRECTOR_CONTEXT.md").read_text()
# Replace the status line
import re
ctx = re.sub(
    r"- \*\*Progress: \d+/\d+ features passing.*?\*\*",
    f"- **Progress: {len(passing)}/{len(features)} features passing ({len(passing)/len(features)*100:.0f}%)**",
    ctx
)
# Update failing list
failing_block = "\n".join(f"[{f['id']:>3}] {f['category']}: {f['name']}" for f in failing)
ctx = re.sub(
    r"(### Features Still Failing \(\d+ remaining\)\n```\n).*?(```)",
    f"### Features Still Failing ({len(failing)} remaining)\n```\n{failing_block}\n```",
    ctx,
    flags=re.DOTALL
)
Path("DIRECTOR_CONTEXT.md").write_text(ctx)
print(f"Context updated: {len(passing)}/{len(features)} passing, {len(failing)} remaining")
EOF

echo
echo "=== Spawning new director ==="
echo

# Build the handoff prompt
HANDOFF_PROMPT=$(cat <<PROMPT
Read DIRECTOR_CONTEXT.md in the current directory. You are the new director of an autonomous coding agent orchestration.

Your immediate tasks:
1. Read DIRECTOR_CONTEXT.md fully to understand the current state
2. Check if the agent process is still running: ps aux | grep autonomous_agent_demo
3. Show the current progress: python3 -c "from pathlib import Path; from progress import print_progress_summary; print_progress_summary(Path('generations/my_project'))"
4. If the agent is NOT running, restart it: source .venv/bin/activate && python3 autonomous_agent_demo.py --project-dir ./my_project --bedrock &
5. Monitor progress every 5 minutes, fix any security hook issues that block the agent, and report milestones to the user
6. Keep DIRECTOR_CONTEXT.md updated as the session progresses

The goal is to reach 100/100 passing features.
PROMPT
)

echo "Handoff prompt:"
echo "---"
echo "$HANDOFF_PROMPT"
echo "---"
echo
echo "To spawn a new director, start a new Claude Code session in:"
echo "  $SCRIPT_DIR"
echo
echo "And paste the prompt above, or run:"
echo "  claude --print \"\$(cat spawn_director.sh | tail -20)\""
echo
echo "Current progress snapshot saved to DIRECTOR_CONTEXT.md"
