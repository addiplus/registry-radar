'use client';

import { useState, type FormEvent } from 'react';

export interface ScopeSettings {
  npmScope: string;
  githubUser: string;
}

interface ScopeSwitcherProps {
  npmScope: string;
  githubUser: string;
  onApply: (next: ScopeSettings) => void;
}

// Same rules as the route handlers (plan section 3): scopes and usernames are
// validated here so Apply never sends a shape the API would reject.
const SCOPE_PATTERN = /^@[a-z0-9][\w.-]*$/i;
const GITHUB_USER_PATTERN = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;

const inputClass =
  'h-8 w-40 rounded-md border border-border bg-surface px-2 font-mono text-xs text-foreground placeholder:text-muted focus:border-accent focus:outline-none';

export function ScopeSwitcher({ npmScope, githubUser, onApply }: ScopeSwitcherProps) {
  const [scopeDraft, setScopeDraft] = useState(npmScope);
  const [userDraft, setUserDraft] = useState(githubUser);
  // Drafts reset when the applied scope changes from elsewhere (for example
  // the localStorage restore on mount). Adjusting during render is the React
  // sanctioned alternative to syncing with an effect.
  const [applied, setApplied] = useState({ npmScope, githubUser });
  if (applied.npmScope !== npmScope || applied.githubUser !== githubUser) {
    setApplied({ npmScope, githubUser });
    setScopeDraft(npmScope);
    setUserDraft(githubUser);
  }

  const trimmedScope = scopeDraft.trim();
  const trimmedUser = userDraft.trim();
  const valid =
    SCOPE_PATTERN.test(trimmedScope) && GITHUB_USER_PATTERN.test(trimmedUser);
  const unchanged = trimmedScope === npmScope && trimmedUser === githubUser;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || unchanged) return;
    onApply({ npmScope: trimmedScope, githubUser: trimmedUser });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-center gap-2"
      aria-label="Scope settings"
    >
      <label className="flex items-center gap-1.5 text-xs text-muted">
        npm scope
        <input
          value={scopeDraft}
          onChange={(event) => setScopeDraft(event.target.value)}
          placeholder="@scope"
          spellCheck={false}
          autoComplete="off"
          className={inputClass}
        />
      </label>
      <label className="flex items-center gap-1.5 text-xs text-muted">
        GitHub user
        <input
          value={userDraft}
          onChange={(event) => setUserDraft(event.target.value)}
          placeholder="username"
          spellCheck={false}
          autoComplete="off"
          className={inputClass}
        />
      </label>
      <button
        type="submit"
        disabled={!valid || unchanged}
        className="h-8 rounded-md bg-accent px-3 text-xs font-medium text-accent-foreground transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Apply
      </button>
    </form>
  );
}
