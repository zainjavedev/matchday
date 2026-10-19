import { useCallback, useEffect, useState } from 'react';

import { read, write } from './storage.js';

export { storage } from './storage.js';

export function useLocal(key, initial) {
  const [value, setValue] = useState(() => read(key, initial));
  useEffect(() => write(key, value), [key, value]);
  const update = useCallback((next) => setValue((prev) => (typeof next === 'function' ? next(prev) : next)), []);
  return [value, update];
}

export const SETTINGS_VERSION = 2;

export const DEFAULT_SETTINGS = {
  v: SETTINGS_VERSION,
  tz: 'auto',
  clock: 'auto',
  theme: 'auto',
  lead: 30,
  autoBrowser: true,
  autoPhone: true,
  ntfyTopic: '',
  showPractice: false,
};

export const newTopic = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return 'matchday-' + Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 14);
};
