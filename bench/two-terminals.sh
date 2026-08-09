#!/bin/bash
# Two terminals, side by side. Left: your bill without caching. Right: with it.
#
#   ./bench/two-terminals.sh
#
# Both panes replay the SAME real events from ~/.claude/projects in the same order at
# the same rate, and start from a shared epoch passed on the command line — so the two
# running totals always refer to the same event. Nothing is simulated.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
SESSION="tokenssaved-demo"
LEAD_MS=700           # both panes read the same pre-built snapshot, so they are ready
                      # almost immediately; this is just scheduling slack

command -v tmux >/dev/null || { echo "tmux is not installed"; exit 1; }
command -v bun  >/dev/null || { echo "bun is not installed";  exit 1; }

tmux kill-session -t "$SESSION" 2>/dev/null || true

# One snapshot, both panes. The transcript directory is live — a running Claude Code
# session appends to it — so two panes walking it independently would price different
# event sets and their totals would stop corresponding.
echo "Freezing the event stream…"
( cd "$REPO" && bun run bench/snapshot.ts )

START=$(( $(date +%s)000 + LEAD_MS ))

tmux new-session  -d -s "$SESSION" -x "$(tput cols)" -y "$(tput lines)" \
  "cd '$REPO' && bun run bench/demo.ts --arm without --start $START; echo; read -r"
tmux split-window -h -t "$SESSION" \
  "cd '$REPO' && bun run bench/demo.ts --arm with    --start $START; echo; read -r"

tmux set -t "$SESSION" pane-border-status top
tmux set -t "$SESSION" pane-border-format " #{pane_index} "
tmux select-pane -t "$SESSION".0

echo "Attaching. Both panes finish together; press Enter in each to exit, or Ctrl-b then & to kill."
tmux attach -t "$SESSION"
