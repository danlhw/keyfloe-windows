import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc';
import type {
  AppSettings, InterviewState, PointerState, VoiceUIState,
} from '../shared/types';
import type { ChatRequest } from '../main/chat';

// Single, narrowly-typed bridge exposed to the renderer's window object.
// The renderer never touches ipcRenderer directly — that's enforced by
// contextIsolation: true. Adding a new API surface? Touch this file +
// src/shared/ipc.ts + the main-side handler, in that order.

const api = {
  settings: {
    get:   () => ipcRenderer.invoke(IPC.settingsGet) as Promise<AppSettings>,
    set:   (patch: Partial<AppSettings>) =>
             ipcRenderer.invoke(IPC.settingsSet, patch) as Promise<AppSettings>,
    onChange: (cb: (s: AppSettings) => void) => subscribe(IPC.settingsChanged, cb),
  },
  chat: {
    stream: (req: ChatRequest) =>
              ipcRenderer.invoke(IPC.chatStream, req) as Promise<string>,
    cancel: (streamId: string) => ipcRenderer.invoke(IPC.chatCancel, streamId),
    onDelta: (cb: (e: { streamId: string; delta: string }) => void) =>
               subscribe(IPC.chatDelta, cb),
    onDone:  (cb: (e: { streamId: string }) => void) =>
               subscribe(IPC.chatDone, cb),
    onError: (cb: (e: { streamId: string; message: string }) => void) =>
               subscribe(IPC.chatError, cb),
  },
  pill: {
    show:    () => ipcRenderer.invoke(IPC.pillShow),
    hide:    () => ipcRenderer.invoke(IPC.pillHide),
    toggle:  () => ipcRenderer.invoke(IPC.pillToggle),
    resize:  (w: number, h: number) =>
                ipcRenderer.invoke(IPC.pillResize, { width: w, height: h }),
  },
  capture: {
    screen: () => ipcRenderer.invoke(IPC.captureScreen) as Promise<string | null>,
  },
  hotkey: {
    onTap:       (cb: () => void) => subscribe(IPC.hotkeyTap, cb),
    onHoldStart: (cb: () => void) => subscribe(IPC.hotkeyHoldStart, cb),
    onHoldEnd:   (cb: () => void) => subscribe(IPC.hotkeyHoldEnd, cb),
  },
  voice: {
    onState: (cb: (s: VoiceUIState) => void) => subscribe(IPC.voiceState, cb),
    paste:   (text: string) => ipcRenderer.invoke(IPC.dictationPaste, text),
    pushWav: (wavBase64: string | null) =>
               ipcRenderer.invoke('dictation:wav', { wavBase64 }),
    onBegin: (cb: () => void) => subscribe('dictation:begin', cb),
    onEnd:   (cb: () => void) => subscribe('dictation:end', cb),
    onAbort: (cb: () => void) => subscribe('dictation:abort', cb),
  },
  interview: {
    start:   () => ipcRenderer.invoke(IPC.interviewStart) as Promise<InterviewState>,
    stop:    () => ipcRenderer.invoke(IPC.interviewStop) as Promise<InterviewState>,
    ask:     () => ipcRenderer.invoke(IPC.interviewAskAnswer) as Promise<
                     { ok: true; text: string } | { ok: false; message: string }>,
    onState: (cb: (s: InterviewState) => void) => subscribe(IPC.interviewState, cb),
    pushChunk: (payload: {
                  role: 'Me' | 'Interviewer';
                  wavBase64: string;
                  durationMs: number;
                  rms: number;
                }) => ipcRenderer.invoke('interview:chunk', payload),
    pushMicLevel: (level: number) => ipcRenderer.invoke('interview:mic-level', level),
    onBegin: (cb: () => void) => subscribe('interview:begin', cb),
    onEnd:   (cb: () => void) => subscribe('interview:end', cb),
  },
  pointer: {
    request: (payload: {
                screenshotDataUrl: string;
                question: string;
                screen: { width: number; height: number };
              }) => ipcRenderer.invoke(IPC.pointerRequest, payload),
    clear:   () => ipcRenderer.invoke(IPC.pointerClear),
    onState: (cb: (s: PointerState) => void) => subscribe(IPC.pointerState, cb),
  },
};

function subscribe<T = unknown>(channel: string, cb: (payload: T) => void): () => void {
  const handler = (_e: unknown, payload: T) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('keyfloe', api);
export type KeyfloeAPI = typeof api;
