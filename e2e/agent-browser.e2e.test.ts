import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

interface CommandResult {
  stdout: string;
  stderr: string;
}

async function runAgentBrowser(args: string[], timeoutMs: number = 60_000): Promise<CommandResult> {
  const { stdout, stderr } = await execFileAsync('npx', ['agent-browser', ...args], {
    timeout: timeoutMs,
    env: {
      ...process.env,
      // Keep output stable across environments
      FORCE_COLOR: '0',
    },
  });

  return {
    stdout: (stdout ?? '').toString(),
    stderr: (stderr ?? '').toString(),
  };
}

async function waitForTextInMain(expectedText: string, maxWaitMs: number = 60_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const mainText = await runAgentBrowser(['get', 'text', 'main'], 30_000);
    if (mainText.stdout.includes(expectedText)) return;
    await runAgentBrowser(['wait', '500'], 5_000);
  }
  throw new Error(`Timed out waiting for text in <main>: "${expectedText}"`);
}

describe('E2E: agent-browser UI flows', () => {
  const port = Number(process.env.E2E_PORT || '3005');
  const baseUrl = `http://127.0.0.1:${port}`;

  beforeAll(async () => {
    await runAgentBrowser(['open', baseUrl], 60_000);
    await runAgentBrowser(['set', 'viewport', '1280', '800'], 15_000);
    await waitForTextInMain('Manage Search Queries', 90_000);
  });

  afterAll(async () => {
    try {
      await runAgentBrowser(['close'], 30_000);
    } catch {
      // best-effort cleanup
    }
  });

  it('adds a term and generates a blog article (deterministic)', async () => {
    const query = `e2e query ${Date.now()}`;

    await runAgentBrowser(['find', 'placeholder', 'Enter a query to track...', 'fill', query], 30_000);
    // Submit the form (QueryInput uses a submit button).
    await runAgentBrowser(['click', 'button[type="submit"]'], 30_000);
    await waitForTextInMain(query, 60_000);

    // Create a blog article (E2E mode generates locally in the UI).
    await runAgentBrowser(['click', 'button[title="Create Blog content"]'], 30_000);
    await waitForTextInMain('Blog Content', 60_000);

    const mainText = await runAgentBrowser(['get', 'text', 'main'], 30_000);
    expect(mainText.stdout).toContain(query);
    expect(mainText.stdout).toContain('E2E test article');
  });
});

