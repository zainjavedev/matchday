// Safe localStorage wrapper. In the browser it persists; on the server (no localStorage)
// it falls back to an in-memory map, which is enough to cache schedules between reminder runs.
const mem = new Map();
const ls = () => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

export const read = (key, fallback) => {
  const store = ls();
  try {
    const raw = store ? store.getItem(key) : mem.get(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
};

export const write = (key, value) => {
  const store = ls();
  try {
    if (store) store.setItem(key, JSON.stringify(value));
    else mem.set(key, JSON.stringify(value));
  } catch {}
};

export const storage = { read, write };
