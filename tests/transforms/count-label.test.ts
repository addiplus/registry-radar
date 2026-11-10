import { describe, expect, it } from 'vitest';

import { countLabel, repoCountLabels } from '@/lib/transforms/count-label';

describe('countLabel', () => {
  it('uses the singular unit for exactly one', () => {
    expect(countLabel(1, 'star', 'stars')).toBe('1 star');
  });

  it('uses the plural unit for zero and for many, with grouping', () => {
    expect(countLabel(0, 'star', 'stars')).toBe('0 stars');
    expect(countLabel(12345, 'star', 'stars')).toBe('12,345 stars');
  });
});

describe('repoCountLabels', () => {
  it('never reads "1 open issues + PRs"', () => {
    expect(repoCountLabels({ stars: 1, forks: 1, openIssuePrCount: 1 })).toEqual([
      '1 star',
      '1 fork',
      '1 open issue or PR',
    ]);
  });

  it('keeps the existing plural wording', () => {
    expect(repoCountLabels({ stars: 3, forks: 0, openIssuePrCount: 7 })).toEqual([
      '3 stars',
      '0 forks',
      '7 open issues + PRs',
    ]);
  });
});
