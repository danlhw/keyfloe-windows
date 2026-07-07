// Live-interview hook: subscribes to the Rust session's events and exposes
// start / stop / ask actions. Used by the overlay window; can also drive a
// toggle button in the main app. Uses raw `invoke`/`listen` so it works before
// the commands are wired into the generated `bindings.ts`.

import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { CMD, EV, type InterviewStateDto, type InterviewTurn } from "./types";

export interface AnswerState {
  streaming: boolean;
  text: string;
  error: string | null;
}

export function useInterviewSession() {
  const [turns, setTurns] = useState<InterviewTurn[]>([]);
  const [state, setState] = useState<InterviewStateDto>({
    running: false,
    systemAudioActive: false,
    error: null,
  });
  const [micLevel, setMicLevel] = useState(0);
  const [answer, setAnswer] = useState<AnswerState>({
    streaming: false,
    text: "",
    error: null,
  });
  const answerRef = useRef("");

  useEffect(() => {
    const unlisten: UnlistenFn[] = [];
    (async () => {
      unlisten.push(
        await listen<InterviewTurn[]>(EV.turns, (e) => setTurns(e.payload)),
      );
      unlisten.push(
        await listen<InterviewStateDto>(EV.state, (e) => setState(e.payload)),
      );
      unlisten.push(
        await listen<number>(EV.micLevel, (e) => setMicLevel(e.payload)),
      );
      unlisten.push(
        await listen(EV.answerBegin, () => {
          answerRef.current = "";
          setAnswer({ streaming: true, text: "", error: null });
        }),
      );
      unlisten.push(
        await listen<{ text: string }>(EV.answerDelta, (e) => {
          answerRef.current += e.payload.text;
          setAnswer((a) => ({ ...a, text: answerRef.current }));
        }),
      );
      unlisten.push(
        await listen(EV.answerEnd, () =>
          setAnswer((a) => ({ ...a, streaming: false })),
        ),
      );
      unlisten.push(
        await listen<{ text: string }>(EV.answerError, (e) =>
          setAnswer((a) => ({ ...a, streaming: false, error: e.payload.text })),
        ),
      );
      // Sync initial running state (in case the session was already live).
      try {
        const running = await invoke<boolean>(CMD.isRunning);
        setState((s) => ({ ...s, running }));
      } catch {
        /* command not registered yet — ignore */
      }
    })();
    return () => {
      unlisten.forEach((u) => u());
    };
  }, []);

  const start = useCallback(() => invoke(CMD.start).catch(console.error), []);
  const stop = useCallback(() => invoke(CMD.stop).catch(console.error), []);
  const toggle = useCallback(
    () => invoke<boolean>(CMD.toggle).catch((e) => (console.error(e), false)),
    [],
  );
  const askAnswer = useCallback(
    () => invoke(CMD.askAnswer).catch(console.error),
    [],
  );

  return { turns, state, micLevel, answer, start, stop, toggle, askAnswer };
}
