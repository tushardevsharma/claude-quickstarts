# Director Context — Autonomous Coding Agent Session

## Current Status (as of handoff)
- **Progress: 93/100 features passing (93%)**
- Agent process PID 53573 is still running (autonomous_agent_demo.py)
- Branch: `tushardevsharma/ai-digital-avatar`
- Project dir: `generations/my_project`

## What Was Built This Session

### Harness Improvements (committed to main harness)
1. **Progress visualization** (`progress.py`) — overall bar, per-category bars with DONE labels, "new this session" wins, "next up" queue. Uses `█/░` block chars.
2. **Security fixes** (`security.py`):
   - Added `echo` to allowlist
   - Fixed `pkill -f "..." 2>/dev/null` — strip redirections before parsing
   - Added `kill` with numeric-PID-only validator
   - Added `cd` to allowlist
   - Added `curl` with localhost-only validator (added by settings hook)
   - 92→98 security tests passing
3. **`save_snapshot()`** in agent.py — snapshots passing IDs at session start so "new this session" diff is accurate

### App Features Implemented (in generations/my_project)
Session started at 46/100. Major commits:
- `fae2c2c` — ElevenLabs TTS (replaced browser speech synthesis)
- `4d97279` — Multi-model switching UI, expanded Settings panel, model badge
- `5f92d46` — Interruption details, state indicators, context window, model edge cases
- Latest unnamed commit(s) bringing to 79/100

### Features Still Failing (7 remaining)
```
[ 19] Voice Input: Voice Activity Detection
[ 20] Voice Input: Speech-to-Text Transcription
[ 21] Voice Input: Microphone Toggle Off
[ 22] Interruption: Barge-In Interrupt
[ 54] Multi-Model Switching: Per-Model Thinking Timeout
[ 98] Transcript Panel: Live Captions Synchronized with Audio During Speaking
[ 99] Latency: Pre-Warm TTS WebSocket Connection
```

## Environment
- Python venv: `.venv/` (Python 3.14)
- Bedrock: `CLAUDE_CODE_USE_BEDROCK=1`, `AWS_PROFILE` set, region `us-west-2`
- Model: `us.anthropic.claude-sonnet-4-6`
- App runs on: frontend `http://localhost:5173`, backend `http://localhost:3000`
- Servers started by: `npm --prefix generations/my_project/server start &` and `npm --prefix generations/my_project/client run dev &`

## Key Files
```
autonomous-coding/
├── autonomous_agent_demo.py   # Entry point — run with --bedrock --project-dir ./my_project
├── agent.py                   # Session loop, calls save_snapshot() before each coding session
├── client.py                  # SDK client, security hooks, MCP puppeteer
├── security.py                # Bash allowlist + validators (pkill, kill, chmod, curl, init.sh)
├── progress.py                # Visual progress bars, snapshot diffing
├── prompts.py                 # Prompt loading + spec checksum
├── prompts/
│   ├── app_spec.txt           # Full application spec
│   ├── coding_prompt.md       # Agent instructions for coding sessions
│   ├── initializer_prompt.md  # First-run setup prompt
│   └── spec_sync_prompt.md    # Spec change sync prompt
└── generations/my_project/    # Generated app (cwd for agent)
    ├── feature_list.json      # Source of truth — 93/100 passing
    ├── claude-progress.txt    # Agent's own session notes
    └── .progress_snapshot.json # Snapshot for new-wins diffing
```

## Known Issues / Gotchas
- Multi-line `node -e "..."` blocks get blocked by security hook (can't parse). Agent works around it by writing `.mjs` files to `/private/tmp/claude/` and running them.
- `kill $(lsof -ti:PORT)` subshell expansion confuses the validator — agent should use `pkill node` instead.
- When agent kills node (to restart server), it also kills the Vite dev process, which crashes the Puppeteer browser frame. Agent recovers by restarting both servers and navigating fresh.
- Puppeteer frame becomes permanently detached if navigation is attempted before the new page loads. Agent needs to `sleep` after server restart before navigating.

## How to Resume / Spawn New Director
```bash
cd /Users/tdevsharma/Documents/tushar-space/tushar-space/src/claude-quickstarts/claude-quickstarts/autonomous-coding
source .venv/bin/activate

# Check current progress
python3 -c "
from pathlib import Path
from progress import print_progress_summary
print_progress_summary(Path('generations/my_project'))
"

# If agent is NOT running, restart it:
python3 autonomous_agent_demo.py --project-dir ./my_project --bedrock

# If agent IS still running, just monitor:
# PID is in: ps aux | grep autonomous_agent_demo
```

## Director Responsibilities
1. Monitor agent output and progress
2. Fix security hook gaps as the agent hits them (edit security.py + test_security.py, run tests, commit)
3. Report progress milestones to user
4. If agent stalls (same output line repeating for >5 min), check if it's stuck in a Puppeteer loop — it will self-recover eventually
5. Restart the agent if the process dies unexpectedly
6. Keep this DIRECTOR_CONTEXT.md updated with current state
