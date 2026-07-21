'use client';

import { useState } from 'react';
import { isApiError } from '@/lib/api-error';
import { NOTE_MAX_LENGTH } from '@/lib/constants';
import { useNoteMutation } from '@/lib/query/mutations';

// Note editor with rollback-safe UX. The draft is local state and is never
// cleared by the mutation lifecycle: when the PUT fails, useNoteMutation
// rolls the watchlist cache back to the snapshot while this textarea keeps
// the user's text and shows an error, so nothing they typed is lost.
export function NoteEditor({ name, note }: { name: string; note: string | null }) {
  const [draft, setDraft] = useState(note ?? '');
  const [syncedNote, setSyncedNote] = useState(note);
  const mutation = useNoteMutation();

  // Resync the draft from the server value only while the mutation is idle,
  // via the "adjusting state during render" pattern from the React docs:
  // when the note prop changes, state is adjusted synchronously during this
  // render and React re-renders before committing. On error (the rollback
  // moment) and mid-save this stays hands off, and after a successful save
  // the stored note equals the trimmed draft anyway, so the only time the
  // draft is replaced is a genuinely external change.
  if (syncedNote !== note) {
    setSyncedNote(note);
    if (!mutation.isPending && !mutation.isError) {
      setDraft(note ?? '');
    }
  }

  const dirty = draft.trim() !== (note ?? '');

  return (
    <div className="flex flex-col gap-1.5">
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        maxLength={NOTE_MAX_LENGTH}
        rows={2}
        disabled={mutation.isPending}
        placeholder="Add a note"
        aria-label={`Note for ${name}`}
        className="w-full resize-y rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      />

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-zinc-400 dark:text-zinc-500">
          {draft.length}/{NOTE_MAX_LENGTH}
        </span>
        <button
          type="button"
          onClick={() => mutation.mutate({ name, note: draft })}
          disabled={mutation.isPending || !dirty}
          className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          {mutation.isPending ? 'Saving...' : 'Save note'}
        </button>
      </div>

      {mutation.isError && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {isApiError(mutation.error)
            ? mutation.error.message
            : 'Note could not be saved. Your text is still here; try again.'}
        </p>
      )}
    </div>
  );
}
