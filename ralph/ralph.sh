#!/bin/bash

# Ralph Wiggum - Autonomous AI Coding Loop
# Adapted for Cursor IDE
# 
# Usage:
#   ./ralph.sh [iterations] [mode]
# 
# Modes:
#   hitl - Human-in-the-loop (run once, watch, intervene)
#   afk  - Away from keyboard (loop with max iterations)
#
# Example:
#   ./ralph.sh 5 afk    # Run 5 iterations in AFK mode
#   ./ralph.sh 1 hitl   # Run once in HITL mode

set -e

RALPH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$RALPH_DIR/.." && pwd)"
PRD_FILE="$RALPH_DIR/prd.json"
PROGRESS_FILE="$RALPH_DIR/progress.txt"
AGENTS_FILE="$RALPH_DIR/AGENTS.md"

# Parse arguments
ITERATIONS=${1:-1}
MODE=${2:-hitl}

if [ "$MODE" != "hitl" ] && [ "$MODE" != "afk" ]; then
  echo "Error: Mode must be 'hitl' or 'afk'"
  echo "Usage: $0 [iterations] [hitl|afk]"
  exit 1
fi

# Validate files exist
if [ ! -f "$PRD_FILE" ]; then
  echo "Error: PRD file not found at $PRD_FILE"
  exit 1
fi

if [ ! -f "$AGENTS_FILE" ]; then
  echo "Error: AGENTS.md not found at $AGENTS_FILE"
  exit 1
fi

cd "$PROJECT_ROOT"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🤖 Ralph Wiggum - Autonomous AI Coding"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Mode: $MODE"
echo "Iterations: $ITERATIONS"
echo "PRD: $PRD_FILE"
echo "Progress: $PROGRESS_FILE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Function to append to progress file
append_progress() {
  local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
  echo "[$timestamp] $1" >> "$PROGRESS_FILE"
  echo "" >> "$PROGRESS_FILE"
}

# Function to check if work is complete
check_complete() {
  # Check if PRD contains "COMPLETE" marker or all tasks pass
  # This is a simple check - you can enhance it
  if grep -q "<promise>COMPLETE</promise>" "$PROGRESS_FILE"; then
    return 0
  fi
  return 1
}

# Function to run feedback loops
run_feedback_loops() {
  echo "🔄 Running feedback loops..."
  
  # Type checking
  if command -v tsc &> /dev/null; then
    echo "  ✓ Running TypeScript type check..."
    if ! npx tsc --noEmit 2>&1 | tee /tmp/ralph-typecheck.log; then
      echo "  ✗ TypeScript errors found"
      return 1
    fi
    echo "  ✓ TypeScript check passed"
  fi
  
  # Linting
  if [ -f "package.json" ] && grep -q '"lint"' package.json; then
    echo "  ✓ Running linter..."
    if ! npm run lint 2>&1 | tee /tmp/ralph-lint.log; then
      echo "  ✗ Linting errors found"
      return 1
    fi
    echo "  ✓ Linting passed"
  fi
  
  # Build
  if [ -f "package.json" ] && grep -q '"build"' package.json; then
    echo "  ✓ Running build..."
    if ! npm run build 2>&1 | tee /tmp/ralph-build.log; then
      echo "  ✗ Build failed"
      return 1
    fi
    echo "  ✓ Build succeeded"
  fi
  
  # Tests (if available)
  if [ -f "package.json" ] && grep -q '"test"' package.json; then
    echo "  ✓ Running tests..."
    if ! npm test 2>&1 | tee /tmp/ralph-test.log; then
      echo "  ✗ Tests failed"
      return 1
    fi
    echo "  ✓ Tests passed"
  fi
  
  echo "✅ All feedback loops passed"
  return 0
}

# Main loop
for ((i=1; i<=ITERATIONS; i++)); do
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🔄 Iteration $i/$ITERATIONS"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  
  # Check if already complete
  if check_complete; then
    echo "✅ All tasks complete! Exiting."
    append_progress "Iteration #$i - PRD complete, exiting."
    exit 0
  fi
  
  # Prepare prompt context
  PRD_CONTENT=$(cat "$PRD_FILE")
  PROGRESS_CONTENT=$(tail -50 "$PROGRESS_FILE" 2>/dev/null || echo "No progress yet")
  AGENTS_CONTENT=$(cat "$AGENTS_FILE")
  
  # Create instruction file for this iteration
  INSTRUCTION_FILE="/tmp/ralph-instruction-$i.txt"
  cat > "$INSTRUCTION_FILE" << EOF
# Ralph Iteration #$i

## Context
You are working autonomously on this codebase using the Ralph Wiggum approach.

## Instructions
1. Read the PRD: $PRD_FILE
2. Read the progress: $PROGRESS_FILE
3. Read the agent instructions: $AGENTS_FILE

## Your Task
1. **Decide which task to work on next** from the PRD. Choose the highest priority task that is not yet complete.
2. **Work on ONLY that single task** until it's fully complete.
3. **Run feedback loops** (type checking, linting, tests, build) before committing.
4. **Make a git commit** with a clear message following conventional commits.
5. **Update the progress file** ($PROGRESS_FILE) with what you did.
6. **Update the PRD** to mark the task as complete (set passes: true).

If all tasks are complete, output exactly: <promise>COMPLETE</promise>

## PRD Summary
$PRD_CONTENT

## Recent Progress
$PROGRESS_CONTENT

## Agent Instructions
$AGENTS_CONTENT

---

BEGIN WORK NOW. Remember: only work on ONE task, run feedback loops, commit, update progress.
EOF

  echo "📋 Instruction file created: $INSTRUCTION_FILE"
  echo ""
  echo "🎯 IN CURSOR: Open the instruction file and use Cursor's agent mode"
  echo "   to work through the task described above."
  echo ""
  
  if [ "$MODE" == "hitl" ]; then
    echo "👀 HITL Mode: Waiting for you to complete the iteration..."
    echo "   Press Enter when you're done with this iteration, or Ctrl+C to stop."
    read -r
    
    echo ""
    echo "🔄 Running feedback loops..."
    if run_feedback_loops; then
      append_progress "Iteration #$i - Completed. Feedback loops passed."
      echo "✅ Iteration $i complete!"
    else
      append_progress "Iteration #$i - Completed but feedback loops failed. Review errors above."
      echo "⚠️  Iteration $i complete but feedback loops failed!"
      echo "   Review the errors above before continuing."
      
      if [ "$MODE" == "afk" ]; then
        echo "   Stopping AFK loop due to feedback loop failures."
        exit 1
      fi
    fi
  else
    # AFK mode - in a real implementation, you'd integrate with Cursor's API
    # For now, this is a placeholder that shows the structure
    echo "🤖 AFK Mode: This requires Cursor API integration"
    echo "   For now, use HITL mode or manually invoke Cursor agent with:"
    echo "   cat $INSTRUCTION_FILE"
    echo ""
    echo "   Future: This will automatically trigger Cursor agent mode"
    
    # In a real implementation, you would:
    # 1. Use Cursor's API (if available) to trigger agent mode
    # 2. Wait for completion
    # 3. Run feedback loops
    # 4. Continue loop
    
    echo "   Press Enter to continue to next iteration, or Ctrl+C to stop."
    read -r
  fi
  
  echo ""
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🏁 Completed $ITERATIONS iterations"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
append_progress "Completed $ITERATIONS iterations. Review progress and PRD to continue."