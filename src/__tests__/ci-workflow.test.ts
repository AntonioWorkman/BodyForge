/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * CI must run the project's real verification scripts.
 *
 * A workflow that quietly stops matching package.json — a renamed script, a
 * step dropped during an edit — looks green while checking less than it claims.
 * This asserts the two stay in step.
 */
const ROOT = join(__dirname, '..', '..');
const workflow = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
  engines?: { node?: string };
};

describe('CI workflow', () => {
  it('runs on pull requests and pushes to main', () => {
    expect(workflow).toMatch(/^on:/m);
    expect(workflow).toContain('pull_request:');
    expect(workflow).toContain('branches: [main]');
  });

  it('installs from the lockfile rather than resolving afresh', () => {
    expect(workflow).toContain('npm ci');
    expect(workflow).not.toContain('npm install');
  });

  it('invokes every verification script the project defines', () => {
    for (const script of ['typecheck', 'lint', 'format:check']) {
      expect(packageJson.scripts[script]).toBeDefined();
      expect(workflow).toContain(`npm run ${script}`);
    }
    expect(packageJson.scripts.test).toBeDefined();
    expect(workflow).toContain('npm test');
  });

  it('uses a Node version the project supports', () => {
    const declared = packageJson.engines?.node;
    expect(declared).toBe('>=22');

    const versions = [...workflow.matchAll(/node-version: '(\d+)'/g)].map((m) => Number(m[1]));
    expect(versions.length).toBeGreaterThan(0);
    // Persistence tests use `node:sqlite`, which needs Node 22.
    for (const version of versions) expect(version).toBeGreaterThanOrEqual(22);
  });

  it('caches npm downloads', () => {
    expect(workflow).toContain('cache: npm');
  });

  it('smoke-tests both native bundles', () => {
    expect(workflow).toContain('--platform ios');
    expect(workflow).toContain('--platform android');
  });

  it('does not commit generated native directories to make CI work', () => {
    expect(workflow).not.toContain('expo prebuild');
  });
});
