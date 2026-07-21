import { describe, expect, it } from 'vitest';

import { ApiError } from '@/lib/api-error';
import {
  isValidGitHubRepoName,
  isValidGitHubUsername,
  isValidNpmName,
  isValidNpmScope,
  MAX_JSON_BODY_BYTES,
  NPM_NAME_MAX_LENGTH,
  parseBoundedInt,
  readBoundedJsonBody,
} from '@/lib/server/validate';

describe('isValidNpmName', () => {
  it.each(['react', 'a', 'foo-bar', 'foo.bar', 'foo_bar', '@scope/pkg', '@a/b', '@scope/foo.bar-baz'])(
    'accepts valid name %s',
    (name) => {
      expect(isValidNpmName(name)).toBe(true);
    },
  );

  it.each([
    '',
    '..',
    '../traverse',
    '.leading-dot',
    '_leading-underscore',
    '-leading-hyphen',
    '@scope',
    '@scope/',
    '@/pkg',
    '@scope//pkg',
    'has space',
    'query?string',
    'hash#frag',
    'back\\slash',
    'a'.repeat(NPM_NAME_MAX_LENGTH + 1),
  ])('rejects invalid name %s', (name) => {
    expect(isValidNpmName(name)).toBe(false);
  });

  it('accepts a name at exactly the length cap', () => {
    expect(isValidNpmName('a'.repeat(NPM_NAME_MAX_LENGTH))).toBe(true);
  });
});

describe('isValidNpmScope', () => {
  it.each(['@addiplus', '@a', '@scope-1', '@sco.pe'])('accepts valid scope %s', (scope) => {
    expect(isValidNpmScope(scope)).toBe(true);
  });

  it.each(['', '@', 'addiplus', '../', '@..', '@-lead', '@ scope', '@scope/pkg'])(
    'rejects invalid scope %s',
    (scope) => {
      expect(isValidNpmScope(scope)).toBe(false);
    },
  );
});

describe('isValidGitHubUsername', () => {
  it.each(['addiplus', 'a', 'a-b', 'a1-b2', 'a'.repeat(39)])('accepts %s', (user) => {
    expect(isValidGitHubUsername(user)).toBe(true);
  });

  it.each(['', '-lead', 'trail-', 'under_score', 'dot.name', 'a'.repeat(40), 'two words'])(
    'rejects %s',
    (user) => {
      expect(isValidGitHubUsername(user)).toBe(false);
    },
  );
});

describe('isValidGitHubRepoName', () => {
  it.each(['repo', 'a', 'with.dot', 'with_under', 'with-hyphen', 'a'.repeat(100)])(
    'accepts %s',
    (repo) => {
      expect(isValidGitHubRepoName(repo)).toBe(true);
    },
  );

  it.each(['', 'a'.repeat(101), 'slash/name', 'sp ace', 'bang!', '../etc'])('rejects %s', (repo) => {
    expect(isValidGitHubRepoName(repo)).toBe(false);
  });
});

describe('parseBoundedInt', () => {
  const message = 'Invalid offset or limit.';

  it('returns the fallback when the param is absent', () => {
    expect(parseBoundedInt(null, 7, 1, 50, message)).toBe(7);
  });

  it('parses an in-range value', () => {
    expect(parseBoundedInt('25', 7, 1, 50, message)).toBe(25);
    expect(parseBoundedInt('0', 7, 0, 50, message)).toBe(0);
  });

  it.each(['abc', '3.5', '-1', '1e3', ' 5', '5 '])('rejects non-integer %s', (raw) => {
    expect(() => parseBoundedInt(raw, 7, 1, 50, message)).toThrowError(ApiError);
  });

  it('rejects values outside the bounds with a 400 INVALID_INPUT', () => {
    for (const raw of ['0', '51']) {
      try {
        parseBoundedInt(raw, 7, 1, 50, message);
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).status).toBe(400);
        expect((error as ApiError).code).toBe('INVALID_INPUT');
      }
    }
  });
});

describe('readBoundedJsonBody', () => {
  function requestWith(body: string, headers?: Record<string, string>): Request {
    return new Request('http://localhost/api/watchlist', { method: 'POST', body, headers });
  }

  it('parses a small JSON body', async () => {
    await expect(readBoundedJsonBody(requestWith('{"name":"react"}'))).resolves.toEqual({
      name: 'react',
    });
  });

  it('returns null for unparseable JSON', async () => {
    await expect(readBoundedJsonBody(requestWith('not json'))).resolves.toBeNull();
  });

  it('throws 413 when the actual body exceeds the cap', async () => {
    const body = JSON.stringify({ note: 'x'.repeat(MAX_JSON_BODY_BYTES) });
    try {
      await readBoundedJsonBody(requestWith(body));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(413);
      expect((error as ApiError).code).toBe('INVALID_INPUT');
    }
  });

  it('throws 413 on an oversized declared Content-Length without reading the body', async () => {
    const request = requestWith('{}', { 'content-length': String(MAX_JSON_BODY_BYTES + 1) });
    try {
      await readBoundedJsonBody(request);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(413);
    }
  });

  it('accepts a body just under the cap', async () => {
    const body = JSON.stringify({ note: 'x'.repeat(1024) });
    await expect(readBoundedJsonBody(requestWith(body))).resolves.toEqual({
      note: 'x'.repeat(1024),
    });
  });
});
