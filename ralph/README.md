# Ralph Wiggum - Autonomous AI Coding for Cursor

This directory contains the implementation of the "Ralph Wiggum" approach for autonomous AI coding, adapted for use with Cursor IDE.

## What is Ralph?

Ralph is a loop-based approach to autonomous AI coding. Instead of manually writing prompts for each phase of development, you define what needs to be done (in a PRD), and the AI agent works through tasks autonomously, choosing what to work on next and tracking progress.

**Key Concepts:**
- **Loop-based**: The agent runs in iterations, working through a task list
- **Autonomous**: The agent chooses which task to work on next
- **Self-tracking**: Progress is logged automatically
- **Quality-focused**: Feedback loops (tests, linting, types) ensure code quality

## Files

### `AGENTS.md`
Instructions for AI agents working on this codebase. Defines:
- Code quality standards
- Workflow rules
- Project structure
- Anti-patterns to avoid

### `prd.json`
Product Requirements Document in JSON format. Contains:
- List of tasks to complete
- Priority levels
- Steps for each task
- Completion status (`passes: true/false`)

### `progress.txt`
Log file tracking progress through iterations. Each iteration appends:
- What task was worked on
- What changes were made
- Feedback loop results
- What to work on next

### `ralph.sh`
Main automation script. Handles:
- Reading PRD and progress
- Running iterations
- Executing feedback loops
- Tracking completion

## Usage

### Setup

1. **Edit the PRD** (`prd.json`) with your tasks:
```json
{
  "tasks": [
    {
      "id": "task-1",
      "category": "functional",
      "priority": "high",
      "description": "Add user authentication",
      "steps": ["Step 1", "Step 2"],
      "passes": false
    }
  ]
}
```

2. **Review agent instructions** (`AGENTS.md`) to ensure quality standards match your needs.

### Running Ralph

#### HITL Mode (Human-in-the-Loop)
Best for learning, prompt refinement, and risky tasks:

```bash
./ralph.sh 1 hitl
```

This runs one iteration and waits for you to:
1. Read the instruction file it generates
2. Use Cursor's agent mode to complete the task
3. Press Enter to continue

#### AFK Mode (Away from Keyboard)
For bulk work once you trust the setup:

```bash
./ralph.sh 10 afk
```

This attempts to run 10 iterations autonomously.

**Note**: Full AFK mode requires Cursor API integration, which is not yet available. For now, use HITL mode or manually invoke Cursor agent mode.

### Manual Workflow

If you prefer not to use the script:

1. **Read the PRD**: `cat ralph/prd.json`
2. **Check progress**: `tail -50 ralph/progress.txt`
3. **In Cursor**: Use agent mode with this prompt:

```
@ralph/AGENTS.md @ralph/prd.json @ralph/progress.txt

I'm working autonomously using the Ralph approach.

1. Review the PRD and identify the highest priority incomplete task
2. Work on ONLY that task until complete
3. Run feedback loops (npm run lint, tsc --noEmit, npm run build)
4. Make a git commit with conventional commit message
5. Update ralph/progress.txt with what you did
6. Update ralph/prd.json to mark the task as complete (passes: true)

If all tasks are complete, output: <promise>COMPLETE</promise>
```

## The 11 Tips (Adapted for Cursor)

### 1. Ralph Is A Loop
Instead of writing new prompts for each phase, run the same prompt in a loop. The agent chooses tasks, tracks progress, and commits work.

### 2. Start With HITL, Then Go AFK
- **HITL**: Run once, watch, intervene. Best for learning and refinement.
- **AFK**: Run in a loop. Best for bulk work once you trust the setup.

### 3. Define The Scope
Use `prd.json` to define what "done" looks like. Be specific:
- What features need to be built
- What quality standards to meet
- What tests are required

### 4. Track Ralph's Progress
The `progress.txt` file serves as a living TODO list. Each iteration appends what was done and what's next.

### 5. Use Feedback Loops
Before committing, always:
- Run type checking: `tsc --noEmit`
- Run linting: `npm run lint`
- Run tests: `npm test` (if available)
- Build: `npm run build`

### 6. Take Small Steps
Break large features into smaller tasks. Each task should be completable in one iteration.

### 7. Prioritize Risky Tasks
Tackle hard problems first:
1. Architectural decisions
2. Integration points
3. Unknown unknowns
4. Standard features
5. Polish and cleanup

### 8. Explicitly Define Software Quality
See `AGENTS.md` for quality standards. Don't let the agent cut corners.

### 9. Use Docker Sandboxes (Future)
For true AFK mode, consider running in a Docker container to isolate changes.

### 10. Pay To Play
Use high-quality AI models (Claude, GPT-4) for best results. Local models may not be sufficient yet.

### 11. Make It Your Own
Customize:
- Task sources (GitHub Issues, Linear, etc.)
- Feedback loops
- Output format (branches, PRs, etc.)
- Alternative loops (test coverage, linting, entropy)

## Customizing for Your Needs

### Alternative Task Sources

Instead of `prd.json`, you could pull from:
- GitHub Issues: Use GitHub API to fetch issues
- Linear: Integrate with Linear API
- Markdown: Convert a markdown TODO list to JSON

### Alternative Loops

Create specialized loops:
- **Test Coverage Loop**: Find uncovered code, write tests, iterate until target coverage
- **Linting Loop**: Fix linting errors one by one
- **Entropy Loop**: Find code smells, refactor, document changes

### Changing Output

Instead of committing to main:
- Create branches and open PRs
- Update GitHub Issues with progress
- Generate changelog entries

## Tips for Success

1. **Start small**: Begin with a simple task to learn the workflow
2. **Watch the first few iterations**: Understand what the agent does
3. **Refine your PRD**: Be specific about what "done" means
4. **Trust but verify**: Review commits before merging
5. **Use feedback loops**: Don't skip tests and linting
6. **Keep codebase clean**: Ralph amplifies what it sees - clean code begets clean code

## Troubleshooting

### Agent keeps working on the same task
- Check if the task is marked as `passes: true` in PRD
- Verify progress file is being updated
- Ensure feedback loops are passing

### Feedback loops failing
- Fix errors manually before continuing
- Consider breaking the task into smaller pieces
- Check if dependencies need updating

### Agent declares victory too early
- Make your PRD more specific
- Add more granular steps to tasks
- Require tests for all features

### TypeScript errors accumulating
- Run `tsc --noEmit` manually and fix errors
- Ensure agent instructions emphasize type safety
- Consider using stricter TypeScript config

## Future Enhancements

- [ ] Cursor API integration for true AFK mode
- [ ] GitHub Issues integration
- [ ] Automatic PR creation
- [ ] Test coverage tracking
- [ ] Cost tracking and budgeting
- [ ] WhatsApp/Slack notifications on completion
- [ ] Docker sandbox support

## References

Based on: [11 Tips For AI Coding With Ralph Wiggum](https://www.aihero.dev/tips-for-ai-coding-with-ralph-wiggum)

---

**Remember**: You define the destination. Ralph figures out the path.