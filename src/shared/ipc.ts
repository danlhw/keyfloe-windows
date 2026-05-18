// Single source of truth for IPC channel names. Both sides import from
// here so a typo on one end is a compile error, not a silent runtime
// "nothing happens".

export const IPC = {
  // Renderer → Main (invoke / handle)
  chatStream:        'chat:stream',        // returns a streamId; deltas arrive on chat:delta
  chatCancel:        'chat:cancel',
  pointerRequest:    'pointer:request',    // Send a screenshot + question; Claude returns coords for [POINT]/[CLICK]
  pointerClear:      'pointer:clear',
  interviewStart:    'interview:start',
  interviewStop:     'interview:stop',
  interviewAskAnswer:'interview:ask',
  pillShow:          'pill:show',
  pillHide:          'pill:hide',
  pillToggle:        'pill:toggle',
  pillResize:        'pill:resize',
  settingsGet:       'settings:get',
  settingsSet:       'settings:set',
  dictationPaste:    'dictation:paste',
  captureScreen:     'capture:screen',
  permissionsCheck:  'permissions:check',

  // Main → Renderer (broadcast)
  chatDelta:         'chat:delta',         // { streamId, delta }
  chatDone:          'chat:done',          // { streamId }
  chatError:         'chat:error',         // { streamId, message }
  voiceState:        'voice:state',        // VoiceUIState
  interviewState:    'interview:state',    // InterviewState (whole snapshot)
  pointerState:      'pointer:state',      // PointerState
  hotkeyTap:         'hotkey:tap',         // user single-tapped the activation key
  hotkeyHoldStart:   'hotkey:hold-start',  // crossed hold threshold
  hotkeyHoldEnd:     'hotkey:hold-end',
  settingsChanged:   'settings:changed',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
