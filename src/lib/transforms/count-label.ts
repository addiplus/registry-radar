const countFormat = new Intl.NumberFormat('en-US');

// "1 star", "2 stars". The unit changes on exactly 1 so a repo with a single
// open issue or PR never reads "1 open issues + PRs".
export function countLabel(n: number, singular: string, plural: string): string {
  return `${countFormat.format(n)} ${n === 1 ? singular : plural}`;
}

export function repoCountLabels(signals: {
  stars: number;
  forks: number;
  openIssuePrCount: number;
}): [string, string, string] {
  return [
    countLabel(signals.stars, 'star', 'stars'),
    countLabel(signals.forks, 'fork', 'forks'),
    countLabel(signals.openIssuePrCount, 'open issue or PR', 'open issues + PRs'),
  ];
}
