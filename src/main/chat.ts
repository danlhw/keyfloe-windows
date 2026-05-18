import { ipcMain } from 'electron';
import { v4 as uuid } from 'uuid';
import { settings } from './settings';
import { baseFromSettings, endpoints } from '../shared/endpoints';
import { IPC } from '../shared/ipc';
import { logger } from './log';
import { deviceId } from './deviceId';

// Port of Claude/ClaudeClient.swift — streaming Anthropic Messages API.
// Two paths, same as Mac:
//   1. DEV — if anthropicApiKey is configured in settings (or
//      ANTHROPIC_API_KEY env), send directly to api.anthropic.com.
//   2. SAAS — default. Through the Cloudflare Worker which holds the
//      Anthropic key, enforces tier + free-tier quota, returns 402/429.
//
// We also support a 'feature' tag — when set to 'interview', the Worker
// gates the request on Pro-tier entitlement. Matches ClaudeClient.featureTag.

export type ChatModel =
  | 'claude-sonnet-4-6'
  | 'claude-haiku-4-5-20251001'
  | 'claude-opus-4-7';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
  imageDataUrl?: string;
  imageLabel?: string;
}

export interface ChatRequest {
  system?: string;
  history: ChatTurn[];
  userText: string;
  userImageDataUrl?: string;
  userImageLabel?: string;
  model?: ChatModel;
  maxTokens?: number;
  feature?: 'interview' | null;
}

export class ChatRouter {
  // Active streams keyed by id so the renderer can cancel mid-flight
  // when the user dismisses the pill or sends a follow-up turn.
  private streams = new Map<string, AbortController>();

  registerIpc() {
    ipcMain.handle(IPC.chatStream, async (e, req: ChatRequest) => {
      const streamId = uuid();
      const ac = new AbortController();
      this.streams.set(streamId, ac);
      // Fire and forget — deltas arrive on chat:delta. The renderer
      // tracks completion via chat:done / chat:error.
      this.runStream(streamId, req, ac.signal, e.sender)
        .catch((err) => {
          logger.error('chat.stream', err);
          e.sender.send(IPC.chatError, {
            streamId,
            message: err?.message ?? String(err),
          });
        })
        .finally(() => this.streams.delete(streamId));
      return streamId;
    });
    ipcMain.handle(IPC.chatCancel, (_e, streamId: string) => {
      const ac = this.streams.get(streamId);
      if (ac) { ac.abort(); this.streams.delete(streamId); }
    });
  }

  private async runStream(
    streamId: string,
    req: ChatRequest,
    signal: AbortSignal,
    sender: Electron.WebContents,
  ) {
    const body = this.buildBody(req);
    const { url, headers } = this.buildRequest(req);
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Anthropic HTTP ${res.status}: ${text}`);
    }
    if (!res.body) throw new Error('Anthropic: empty response body');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    // SSE parse: each event is `data: <json>\n\n`, terminated by
    // `data: [DONE]\n\n`. We accumulate partial chunks because reader
    // boundaries don't align with SSE event boundaries.
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice('data: '.length);
        if (payload === '[DONE]') {
          sender.send(IPC.chatDone, { streamId });
          return;
        }
        try {
          const obj = JSON.parse(payload);
          if (obj.type === 'content_block_delta' && obj.delta?.text) {
            sender.send(IPC.chatDelta, { streamId, delta: obj.delta.text });
          } else if (obj.type === 'message_stop') {
            sender.send(IPC.chatDone, { streamId });
            return;
          } else if (obj.type === 'error') {
            throw new Error(obj.error?.message ?? 'unknown stream error');
          }
        } catch (err) {
          // Swallow parse errors on partial chunks — they'll re-arrive
          // whole on the next iteration. Re-throw if the payload was a
          // semantically broken stream.
          if (err instanceof SyntaxError) continue;
          throw err;
        }
      }
    }
    sender.send(IPC.chatDone, { streamId });
  }

  private buildBody(req: ChatRequest) {
    const messages = [...req.history, {
      role: 'user' as const,
      content: req.userText,
      imageDataUrl: req.userImageDataUrl,
      imageLabel: req.userImageLabel,
    }].map((m) => ({
      role: m.role,
      content: this.contentBlocks(m.content, m.imageDataUrl, m.imageLabel),
    }));

    const body: Record<string, unknown> = {
      model: req.model ?? 'claude-haiku-4-5-20251001',
      max_tokens: req.maxTokens ?? 1024,
      messages,
      stream: true,
    };
    // Anthropic prompt caching: identical 5-min memo so multi-turn
    // chats don't re-pay input tokens for the system prompt.
    if (req.system && req.system.length > 0) {
      body.system = [{
        type: 'text',
        text: req.system,
        cache_control: { type: 'ephemeral' },
      }];
    }
    return body;
  }

  private buildRequest(req: ChatRequest): { url: string; headers: Record<string, string> } {
    const direct = settings.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
    if (direct) {
      return {
        url: 'https://api.anthropic.com/v1/messages',
        headers: {
          'content-type': 'application/json',
          'x-api-key': direct,
          'anthropic-version': '2023-06-01',
        },
      };
    }
    const eps = endpoints(baseFromSettings(settings));
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-oneclick-device-id': deviceId(),
    };
    if (req.feature) headers['x-oneclick-feature'] = req.feature;
    return { url: eps.chat, headers };
  }

  private contentBlocks(text: string, imageDataUrl?: string, label?: string): unknown {
    if (!imageDataUrl) return text;
    const blocks: unknown[] = [];
    if (label) blocks.push({ type: 'text', text: label });
    // data: URL → strip the prefix and feed Claude the base64 directly.
    const m = imageDataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/);
    if (m) {
      blocks.push({
        type: 'image',
        source: { type: 'base64', media_type: m[1], data: m[2] },
      });
    }
    blocks.push({ type: 'text', text });
    return blocks;
  }
}

// Helper for other subsystems that want to do a one-shot non-streaming
// turn (interview's "How do I answer?" with paste-to-pill, pointer's
// computer-use call). Resolves with the full assistant text.
export async function chatOnce(req: ChatRequest): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const router = new ChatRouter();
    let acc = '';
    const fake: any = {
      sender: {
        send: (channel: string, payload: any) => {
          if (channel === IPC.chatDelta) acc += payload.delta;
          if (channel === IPC.chatDone)  resolve(acc);
          if (channel === IPC.chatError) reject(new Error(payload.message));
        },
      },
    };
    const ac = new AbortController();
    (router as any).runStream('once', req, ac.signal, fake.sender)
      .catch((e: Error) => reject(e));
  });
}
