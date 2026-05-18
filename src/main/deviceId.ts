import Store from 'electron-store';
import { v4 as uuid } from 'uuid';

// Stable per-install identifier sent on every Worker request. Used by
// the Worker as the free-tier quota key. Stored once at first launch,
// never identifies the user.

const store = new Store<{ deviceId?: string }>({ name: 'identity' });

export function deviceId(): string {
  const existing = store.get('deviceId');
  if (existing) return existing;
  const fresh = uuid();
  store.set('deviceId', fresh);
  return fresh;
}
