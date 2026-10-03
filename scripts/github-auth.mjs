import { execFileSync } from 'node:child_process';

export function githubToken(env = process.env, execute = execFileSync) {
  const supplied = env.GH_TOKEN?.trim() || env.GITHUB_TOKEN?.trim();
  if (supplied) return supplied;
  if (env.GITHUB_ACTIONS === 'true') throw new Error('GitHub Actions token is required.');
  const credential = execute('git', ['-c', 'credential.interactive=never', 'credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8',
    env: { ...env, GIT_TERMINAL_PROMPT: '0' }, windowsHide: true,
  });
  const token = credential.split('\n').find(line => line.startsWith('password='))?.slice(9).trim();
  if (!token) throw new Error('GitHub login is required.');
  return token;
}
