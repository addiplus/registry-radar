import type { RepoRef } from '../types';

// Parses the npm `repository` field into a GitHub RepoRef.
// Accepts every common spelling:
//   git+https://github.com/o/r.git   git://github.com/o/r.git
//   https://github.com/o/r           ssh://git@github.com/o/r
//   git@github.com:o/r.git           o/r            github:o/r
//   { url, directory } object form (monorepos)
// Returns null for non-GitHub hosts (gitlab, bitbucket) and junk input.
// Normalization: host case ignored, owner/repo lowercased (GitHub is
// case-insensitive), trailing slashes and a trailing .git stripped.
export function parseRepoUrl(input: unknown): RepoRef | null {
  let raw: string | null = null;
  let directory: string | null = null;

  if (typeof input === 'string') {
    raw = input;
  } else if (input !== null && typeof input === 'object') {
    const record = input as { url?: unknown; directory?: unknown };
    if (typeof record.url === 'string') raw = record.url;
    if (typeof record.directory === 'string') directory = record.directory;
  }
  if (raw === null) return null;

  const path = extractGitHubPath(raw);
  if (path === null) return null;

  const noQuery = path.split(/[?#]/)[0];
  const noTrailingSlash = noQuery.replace(/\/+$/, '');
  const noGitSuffix = noTrailingSlash.replace(/\.git$/i, '');
  const segments = noGitSuffix.split('/').filter((s) => s.length > 0);
  if (segments.length < 2) return null;

  const owner = segments[0].toLowerCase();
  const repo = segments[1].toLowerCase();
  if (/\s/.test(owner) || /\s/.test(repo)) return null;

  return { owner, repo, url: `https://github.com/${owner}/${repo}`, directory };
}

// Returns the "owner/repo[/...]" portion when the string points at
// github.com, else null. Shorthand forms pass through untouched.
function extractGitHubPath(raw: string): string | null {
  let s = raw.trim();
  if (s.length === 0) return null;

  // Prefixed shorthand: github:o/r
  const prefixed = /^github:(.+)$/i.exec(s);
  if (prefixed) return prefixed[1];

  // Transport prefix: git+https://... etc.
  if (s.startsWith('git+')) s = s.slice(4);

  // Full URLs and scp-style git@github.com:o/r
  const url = /^(?:[a-z][a-z0-9+.-]*:\/\/)?(?:git@)?(?:www\.)?github\.com[/:](.+)$/i.exec(s);
  if (url) return url[1];

  // Bare shorthand: o/r (npm treats this as GitHub)
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(s)) return s;

  return null;
}
