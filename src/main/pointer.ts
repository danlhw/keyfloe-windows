import { ipcMain, screen } from 'electron';
import { IPC } from '../shared/ipc';
import { logger } from './log';
import type { PointerState, PointerTarget } from '../shared/types';
import { WindowManager } from './windows';
import { chatOnce } from './chat';
import { settings } from './settings';
import { baseFromSettings, endpoints } from '../shared/endpoints';
import { deviceId } from './deviceId';

// Port of Pointing/ComputerUseDetector + Clicky/OverlayWindow. The
// overlay (transparent, click-through, one per display) renders a blue
// cursor + speech bubble. The bubble's anchor coordinates come from
// either:
//
//   1. The chat model emitting a [POINT: x,y "label"] or [CLICK: x,y]
//      tag — quick, no extra round-trip.
//   2. Anthropic's Computer Use beta endpoint via the Worker's /v1/point
//      proxy — pixel-perfect grounding when the chat coords land off.
//
// We do (1) inline as we parse streaming chat output, and fire (2) in
// parallel on the same screenshot. Whoever returns a hit first wins.

export class ClickyPointer {
  private state: PointerState = {
    mode: 'hidden',
    target: null,
    cursor: { x: 0, y: 0 },
  };

  registerIpc() {
    ipcMain.handle(IPC.pointerRequest, async (_e, payload: {
      screenshotDataUrl: string;
      question: string;
      screen: { width: number; height: number };
    }) => {
      const inline = this.askInline(payload);
      const grounded = this.askGrounded(payload);
      const result = await Promise.any([inline, grounded]).catch((e) => {
        throw new Error(`pointer.request: both paths failed: ${e}`);
      });
      this.showTarget(result);
      return result;
    });

    ipcMain.handle(IPC.pointerClear, async () => {
      this.state = { mode: 'hidden', target: null, cursor: this.state.cursor };
      // Tear the overlays down so they can't keep painting / capturing input.
      WindowManager.shared.hideOverlays();
      this.broadcast();
    });
  }

  private async askInline(payload: {
    screenshotDataUrl: string;
    question: string;
    screen: { width: number; height: number };
  }): Promise<PointerTarget> {
    const text = await chatOnce({
      system: [
        'You are pointing at UI elements on the user\'s screen.',
        'The user will ask a question; respond with ONE [POINT: x,y "short label"] tag',
        'or [CLICK: x,y] if the next step is to click. Use integer pixel coordinates',
        'against the attached screenshot resolution. Keep the label under 60 chars.',
      ].join('\n'),
      history: [],
      userText: payload.question,
      userImageDataUrl: payload.screenshotDataUrl,
      userImageLabel: `(image dimensions: ${payload.screen.width}x${payload.screen.height} pixels)`,
      model: 'claude-sonnet-4-6',
      maxTokens: 256,
    });
    const point = parsePointTag(text);
    if (!point) throw new Error('inline: no point tag');
    return point;
  }

  private async askGrounded(payload: {
    screenshotDataUrl: string;
    question: string;
    screen: { width: number; height: number };
  }): Promise<PointerTarget> {
    const eps = endpoints(baseFromSettings(settings));
    const m = payload.screenshotDataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/);
    if (!m) throw new Error('grounded: bad screenshot data URL');
    const body = {
      model: 'claude-sonnet-4-6',
      question: payload.question,
      image: { media_type: m[1], data: m[2] },
      screen: payload.screen,
    };
    const res = await fetch(eps.point, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-oneclick-device-id': deviceId(),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`grounded: HTTP ${res.status}`);
    const json = await res.json() as {
      x: number; y: number; label?: string; click?: boolean;
    };
    return {
      x: json.x,
      y: json.y,
      message: json.label ?? '',
      mode: json.click ? 'click' : 'point',
    };
  }

  private showTarget(target: PointerTarget) {
    this.state = {
      mode: 'pointing',
      target,
      cursor: screen.getCursorScreenPoint(),
    };
    // Lazy-create the overlay windows now (one per display) before
    // broadcasting state — otherwise the broadcast would land on no
    // listeners and the bubble would never paint.
    WindowManager.shared.showOverlays();
    // Tiny delay so the renderer is wired up before we send state.
    setTimeout(() => this.broadcast(), 40);
    logger.info('pointer.show', target);
  }

  private broadcast() {
    WindowManager.shared.overlayWindows().forEach((w) => {
      w.webContents.send(IPC.pointerState, this.state);
    });
  }
}

// Match either [POINT: x,y "label"] or [POINT x,y "label"] or
// [CLICK: x,y] with optional label. We're permissive on whitespace
// because Claude's formatter sometimes drops the colon.
const POINT_RE = /\[POINT[:\s]+(\d+)[,\s]+(\d+)(?:\s+"([^"]*)")?\]/i;
const CLICK_RE = /\[CLICK[:\s]+(\d+)[,\s]+(\d+)(?:\s+"([^"]*)")?\]/i;

function parsePointTag(text: string): PointerTarget | null {
  const click = text.match(CLICK_RE);
  if (click) {
    return {
      x: Number(click[1]),
      y: Number(click[2]),
      message: click[3] ?? '',
      mode: 'click',
    };
  }
  const point = text.match(POINT_RE);
  if (point) {
    return {
      x: Number(point[1]),
      y: Number(point[2]),
      message: point[3] ?? '',
      mode: 'point',
    };
  }
  return null;
}
