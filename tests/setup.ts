import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Vitest runs with globals disabled, so @testing-library/react cannot
// auto-register cleanup. Do it explicitly to keep renders isolated.
afterEach(() => {
  cleanup();
});
