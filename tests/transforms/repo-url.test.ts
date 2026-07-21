import { describe, expect, it } from 'vitest';

import { parseRepoUrl } from '@/lib/transforms/repo-url';

const REF = {
  owner: 'o',
  repo: 'r',
  url: 'https://github.com/o/r',
  directory: null,
};

describe('parseRepoUrl', () => {
  it('parses git+https://github.com/o/r.git', () => {
    expect(parseRepoUrl('git+https://github.com/o/r.git')).toEqual(REF);
  });

  it('parses git://github.com/o/r.git', () => {
    expect(parseRepoUrl('git://github.com/o/r.git')).toEqual(REF);
  });

  it('parses https://github.com/o/r', () => {
    expect(parseRepoUrl('https://github.com/o/r')).toEqual(REF);
  });

  it('parses scp style git@github.com:o/r.git', () => {
    expect(parseRepoUrl('git@github.com:o/r.git')).toEqual(REF);
  });

  it('parses bare shorthand o/r', () => {
    expect(parseRepoUrl('o/r')).toEqual(REF);
  });

  it('parses prefixed shorthand github:o/r', () => {
    expect(parseRepoUrl('github:o/r')).toEqual(REF);
  });

  it('keeps directory from the monorepo object form', () => {
    expect(
      parseRepoUrl({ url: 'https://github.com/o/r', directory: 'packages/core' }),
    ).toEqual({ ...REF, directory: 'packages/core' });
  });

  it('returns null for a gitlab URL', () => {
    expect(parseRepoUrl('https://gitlab.com/o/r')).toBeNull();
    expect(parseRepoUrl('git@gitlab.com:o/r.git')).toBeNull();
  });

  it('normalizes trailing slash and case', () => {
    expect(parseRepoUrl('git+https://GitHub.com/O/R.git/')).toEqual(REF);
    expect(parseRepoUrl('HTTPS://GITHUB.COM/O/R/')).toEqual(REF);
  });
});
