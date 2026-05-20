import Store from 'electron-store';
import type { AppSettings } from '../shared/types';
import { DEFAULT_WORKER_URL } from '../shared/endpoints';

// Default settings. Mirrored to disk via electron-store under
// %APPDATA%\Keyfloe\config.json. We keep this struct flat (no nested
// objects) so partial-update bugs in the renderer are impossible —
// every set replaces the whole record.
const defaults: AppSettings = {
  activationKey: 'RightCtrl',
  stealthMode: false,
  proReasoning: false,
  whisperModel: 'base',
  workerUrl: DEFAULT_WORKER_URL,
  anthropicApiKey: null,
  deepseekApiKey: null,
  openaiApiKey: null,
  interviewResume: null,
};

const store = new Store<AppSettings>({
  name: 'config',
  defaults,
  // Don't serialize null secrets as the literal string "null" — the
  // renderer's "no key configured" check looks at the JS value.
  serialize: (v) => JSON.stringify(v, null, 2),
});

// Cached snapshot kept on the main side so audio / hotkey code paths
// can read settings synchronously without touching electron-store on
// the hot path. Re-read on every settings:set.
export let settings: AppSettings = { ...defaults, ...store.store };

export function getSettings(): AppSettings { return { ...settings }; }

export function setSettings(patch: Partial<AppSettings>): AppSettings {
  settings = { ...settings, ...patch };
  store.store = settings;
  return { ...settings };
}
