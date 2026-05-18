// Minimal structured logger. Writes to %APPDATA%\Keyfloe\logs\keyfloe.log
// in addition to stderr so we can tell users to attach a log file when
// something goes wrong in the wild.

import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

const logDir = path.join(app?.getPath?.('userData') ?? process.cwd(), 'logs');
try { fs.mkdirSync(logDir, { recursive: true }); } catch { /* ignore */ }
const logFile = path.join(logDir, 'keyfloe.log');

function write(level: 'info' | 'warn' | 'error', tag: string, payload: unknown) {
  const ts = new Date().toISOString();
  const line = `${ts} ${level.toUpperCase()} ${tag} ${
    payload === undefined ? '' : safeStringify(payload)
  }\n`;
  try { fs.appendFileSync(logFile, line); } catch { /* ignore */ }
  // eslint-disable-next-line no-console
  console[level === 'info' ? 'log' : level](`[${tag}]`, payload ?? '');
}

function safeStringify(v: unknown): string {
  try {
    if (v instanceof Error) return `${v.message} ${v.stack ?? ''}`;
    if (typeof v === 'string') return v;
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export const logger = {
  info:  (tag: string, payload?: unknown) => write('info',  tag, payload),
  warn:  (tag: string, payload?: unknown) => write('warn',  tag, payload),
  error: (tag: string, payload?: unknown) => write('error', tag, payload),
};
