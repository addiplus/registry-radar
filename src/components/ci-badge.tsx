'use client';

import type { CiStatus } from '@/lib/types';
import type { ReactNode } from 'react';

// Three states per plan section 6: conclusion / running / No CI.
// The conclusion badge links to the workflow run when GitHub gave us a URL.

interface CiBadgeProps {
  ci: CiStatus;
}

const baseClass =
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4';

const toneClasses = {
  muted: 'border-border bg-surface-subtle text-muted',
  success: 'border-success/30 bg-success/10 text-success',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  danger: 'border-danger/30 bg-danger/10 text-danger',
} as const;

type Tone = keyof typeof toneClasses;

function maybeLink(url: string | null, node: ReactNode): ReactNode {
  if (url === null) return node;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => event.stopPropagation()}
      className="hover:underline"
    >
      {node}
    </a>
  );
}

export function CiBadge({ ci }: CiBadgeProps) {
  if (ci.kind === 'none') {
    return <span className={`${baseClass} ${toneClasses.muted}`}>No CI</span>;
  }

  if (ci.kind === 'running') {
    return maybeLink(
      ci.url,
      <span className={`${baseClass} ${toneClasses.warning}`}>CI running</span>,
    );
  }

  let tone: Tone = 'muted';
  let label = `CI ${ci.conclusion}`;
  if (ci.conclusion === 'success') {
    tone = 'success';
    label = 'CI passing';
  } else if (ci.conclusion === 'failure' || ci.conclusion === 'timed_out') {
    tone = 'danger';
    label = ci.conclusion === 'failure' ? 'CI failing' : 'CI timed out';
  }

  return maybeLink(ci.url, <span className={`${baseClass} ${toneClasses[tone]}`}>{label}</span>);
}
