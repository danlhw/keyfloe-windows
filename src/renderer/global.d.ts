import type { KeyfloeAPI } from '../preload';

// The preload exposes `window.keyfloe`. Make it visible to the TS
// compiler so renderer code gets autocomplete + type safety on every
// IPC call.

declare global {
  interface Window {
    keyfloe: KeyfloeAPI;
  }
}

export {};
