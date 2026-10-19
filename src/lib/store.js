import { useCallback, useEffect, useState } from 'react';
import { read, write } from './storage.js';

export { storage } from './storage.js';

// Per-device convenience state (not synced), e.g. the selected time range.
export function useLocal(key, initial) {
  const [value, setValue] = useState(() => read(key, initial));
  useEffect(() => write(key, value), [key, value]);
  const update = useCallback((next) => setValue((prev) => (typeof next === 'function' ? next(prev) : next)), []);
  return [value, update];
}

// Synced to the account. Every game gets a reminder by default.
export const DEFAULT_SETTINGS = {
  tz: 'auto',
  clock: 'auto',
  theme: 'auto',
  lead: 30,
  email: true,
  showPractice: false,
};
