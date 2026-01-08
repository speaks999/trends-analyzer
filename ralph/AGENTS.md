# Agent Instructions for Autonomous Development

This file provides instructions for AI agents working on this codebase autonomously using the Ralph Wiggum approach.

## Codebase Context

This is a **production codebase** for a Trends Analyzer application. The codebase must be maintainable, type-safe, and well-tested. Every shortcut you take becomes someone else's burden. Every hack compounds into technical debt.

You are not just writing code. You are shaping the future of this project. The patterns you establish will be copied. The corners you cut will be cut again.

**Fight entropy. Leave the codebase better than you found it.**

## Quality Standards

### TypeScript
- **Never use `any` types**. Use `unknown` if you need type flexibility, then narrow it.
- All functions must have explicit return types.
- Prefer interfaces over types when possible.
- Use strict TypeScript settings - no implicit any, strict null checks enabled.

### Testing
- All new features must include tests.
- Aim for >80% code coverage on new code.
- Test edge cases and error conditions.
- Use descriptive test names that explain what is being tested.

### Code Style
- Follow existing patterns in the codebase.
- Use meaningful variable and function names.
- Keep functions small and focused (single responsibility).
- Add JSDoc comments for public APIs.

### Error Handling
- Always handle errors explicitly.
- Provide meaningful error messages.
- Log errors appropriately (not to console in production).
- Use try-catch blocks for async operations.

### Database
- All database operations must respect Row Level Security (RLS).
- Use parameterized queries to prevent SQL injection.
- Handle database errors gracefully.
- Cache expensive queries when appropriate.

### API Routes
- Validate all inputs.
- Return appropriate HTTP status codes.
- Handle authentication/authorization properly.
- Use consistent error response formats.

## Workflow Rules

### Task Selection
When choosing the next task from the PRD:

1. **Prioritize risky tasks first**:
   - Architectural decisions and core abstractions
   - Integration points between modules
   - Unknown unknowns and spike work

2. **Then standard features**:
   - Standard features and implementation
   - Polish, cleanup, and quick wins

### Single Feature Focus
- **ONLY WORK ON A SINGLE FEATURE PER ITERATION**
- Complete the feature fully before moving on
- If you notice all work is complete, output `<promise>COMPLETE</promise>`

### Progress Tracking
- After each task, update `ralph/progress.txt`
- Document what was completed
- Note any blockers or issues encountered
- Update the PRD to mark completed items

### Feedback Loops
Before considering a task complete:
1. Run type checking: `npm run type-check` (if available) or `tsc --noEmit`
2. Run linting: `npm run lint`
3. Run tests: `npm test` (if available)
4. Build the project: `npm run build`

Only commit if all feedback loops pass.

### Git Commits
- Make atomic commits (one feature per commit)
- Write clear commit messages following conventional commits format:
  - `feat: add user authentication`
  - `fix: resolve null pointer in trend calculation`
  - `refactor: extract scoring logic into separate module`
  - `test: add unit tests for scoring module`

### When to Stop
Output `<promise>COMPLETE</promise>` only when:
- All tasks in the PRD are marked as complete
- All tests pass
- The build succeeds
- No linting errors remain

## Project Structure

### Key Directories
- `app/api/` - Next.js API routes
- `app/components/` - React components
- `app/lib/` - Shared utilities and business logic
- `supabase/migrations/` - Database migrations
- `ralph/` - Ralph automation files (PRD, progress, scripts)

### Important Files
- `app/lib/storage-db.ts` - Database storage implementation
- `app/lib/supabase.ts` - Server-side Supabase client
- `app/lib/supabase-client.ts` - Client-side Supabase client
- `app/lib/auth-helpers.ts` - Authentication helpers

## Common Patterns

### Async Operations
- Always use `async/await` for async operations
- Never mix promises and callbacks
- Handle promise rejections properly

### Database Queries
- Use `storage` methods from `app/lib/storage-db.ts`
- Always filter by `user_id` for user-specific data
- Use RLS policies for security

### API Routes
- Extract authentication from `Authorization` header
- Use `getAuthenticatedSupabaseClient()` from `app/lib/auth-helpers.ts`
- Return JSON responses with proper status codes

### React Components
- Use TypeScript for all components
- Prefer functional components with hooks
- Handle loading and error states
- Use Context API for shared state (see `auth-context.tsx`)

## Anti-Patterns to Avoid

- ❌ Using `any` types
- ❌ Skipping error handling
- ❌ Committing without running tests
- ❌ Leaving console.log statements in production code
- ❌ Ignoring TypeScript errors
- ❌ Bypassing RLS policies
- ❌ Hardcoding configuration values
- ❌ Writing functions longer than 50 lines
- ❌ Duplicating code instead of extracting utilities

## Questions to Ask Yourself

Before moving to the next task:
1. Have I run all feedback loops?
2. Are all tests passing?
3. Is the code type-safe?
4. Have I updated the progress file?
5. Is my commit atomic and well-documented?
6. Have I left the codebase better than I found it?

---

Remember: You are building software that will outlive this session. Write code as if the next developer is a violent psychopath who knows where you live.