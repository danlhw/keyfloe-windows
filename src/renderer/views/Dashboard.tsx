import { useEffect, useState } from 'react';
import type { ActivationKey, AppSettings } from '@shared/types';

// Port of Dashboard/DashboardView.swift — three tabs: Home (status +
// activation key + quick test), Settings (API keys, worker URL,
// activation key picker), About. Slimmer than the Mac dashboard
// (which has Tasks, Memory, Skills, Profiles, Billing) because the
// Windows scope is only the three live modes.

type Tab = 'home' | 'settings' | 'about';

export function Dashboard() {
  const [tab, setTab] = useState<Tab>('home');
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [dictationCount, setDictationCount] = useState(0);
  const [hotkeyEvents, setHotkeyEvents] = useState<string[]>([]);

  useEffect(() => {
    window.keyfloe.settings.get().then(setSettings);
    const off1 = window.keyfloe.settings.onChange(setSettings);
    const off2 = window.keyfloe.hotkey.onTap(() => {
      setHotkeyEvents((prev) => [`tap @ ${time()}`, ...prev].slice(0, 5));
    });
    const off3 = window.keyfloe.hotkey.onHoldStart(() => {
      setHotkeyEvents((prev) => [`hold-start @ ${time()}`, ...prev].slice(0, 5));
    });
    const off4 = window.keyfloe.hotkey.onHoldEnd(() => {
      setHotkeyEvents((prev) => [`hold-end @ ${time()}`, ...prev].slice(0, 5));
      setDictationCount((n) => n + 1);
    });
    return () => { off1(); off2(); off3(); off4(); };
  }, []);

  if (!settings) {
    return <div className="p-6 text-text-secondary">Loading…</div>;
  }

  return (
    <div className="flex flex-col h-screen bg-bg-base text-text-primary">
      <Header />
      <div className="flex flex-1 min-h-0">
        <Sidebar tab={tab} setTab={setTab} />
        <main className="flex-1 overflow-y-auto p-8">
          {tab === 'home'     && <Home settings={settings} dictationCount={dictationCount} hotkeyEvents={hotkeyEvents} />}
          {tab === 'settings' && <Settings settings={settings} />}
          {tab === 'about'    && <About />}
        </main>
      </div>
    </div>
  );
}

function Header() {
  return (
    <header className="h-9 bg-bg-1 border-b border-border-subtle flex items-center px-4 app-drag select-none">
      <span className="text-text-primary font-medium text-sm">Keyfloe</span>
      <span className="ml-2 text-text-tertiary text-xs">for Windows</span>
    </header>
  );
}

function Sidebar({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const items: { id: Tab; label: string }[] = [
    { id: 'home',     label: 'Home' },
    { id: 'settings', label: 'Settings' },
    { id: 'about',    label: 'About' },
  ];
  return (
    <nav className="w-48 border-r border-border-subtle bg-bg-1 p-3 flex flex-col gap-1">
      {items.map((it) => (
        <button
          key={it.id}
          onClick={() => setTab(it.id)}
          className={[
            'text-left text-sm px-3 py-2 rounded-md',
            tab === it.id
              ? 'bg-accent-600 text-white'
              : 'text-text-secondary hover:bg-bg-2',
          ].join(' ')}
        >
          {it.label}
        </button>
      ))}
    </nav>
  );
}

function Home({ settings, dictationCount, hotkeyEvents }: {
  settings: AppSettings;
  dictationCount: number;
  hotkeyEvents: string[];
}) {
  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <section>
        <h1 className="text-2xl font-medium mb-1">Welcome to Keyfloe</h1>
        <p className="text-text-secondary text-sm">
          Tap <Kbd>{settings.activationKey}</Kbd> to open the pill, hold it to dictate,
          and toggle interview mode from the pill toolbar.
        </p>
      </section>

      <section className="grid grid-cols-3 gap-3">
        <StatCard label="Activation key"     value={settings.activationKey} />
        <StatCard label="Dictations today"   value={dictationCount.toString()} />
        <StatCard label="Whisper model"      value={settings.whisperModel} />
      </section>

      <section>
        <h2 className="text-text-secondary text-xs uppercase tracking-wider mb-2">
          Quick start
        </h2>
        <ol className="text-sm text-text-primary list-decimal list-inside flex flex-col gap-1.5">
          <li>Press <Kbd>{settings.activationKey}</Kbd> to open the chat pill anywhere on your screen.</li>
          <li>Hold <Kbd>{settings.activationKey}</Kbd> to dictate — release to paste into the focused app.</li>
          <li>Click <em>Interview</em> in the pill toolbar to start the live-call helper.</li>
          <li>Ask Keyfloe "where is X?" — a blue cursor will land on it.</li>
        </ol>
      </section>

      <section>
        <h2 className="text-text-secondary text-xs uppercase tracking-wider mb-2">
          Recent hotkey events
        </h2>
        <div className="bg-bg-1 rounded-md border border-border-subtle px-3 py-2 font-mono text-xs text-text-secondary min-h-[3rem]">
          {hotkeyEvents.length === 0 ? (
            <span className="text-text-tertiary">No events yet — try pressing your activation key.</span>
          ) : hotkeyEvents.map((e, i) => <div key={i}>{e}</div>)}
        </div>
      </section>
    </div>
  );
}

function Settings({ settings }: { settings: AppSettings }) {
  const [draft, setDraft] = useState(settings);
  useEffect(() => setDraft(settings), [settings]);

  const save = async (patch: Partial<AppSettings>) => {
    const next = await window.keyfloe.settings.set(patch);
    setDraft(next);
  };

  const keys: ActivationKey[] = ['RightCtrl', 'RightAlt', 'CapsLock', 'F8'];

  return (
    <div className="flex flex-col gap-8 max-w-2xl">
      <Group title="Activation" subtitle="The key Keyfloe watches for tap (open pill) and hold (dictate).">
        <div className="flex gap-2">
          {keys.map((k) => (
            <button
              key={k}
              onClick={() => save({ activationKey: k })}
              className={[
                'px-3 py-2 rounded-md text-sm border',
                draft.activationKey === k
                  ? 'bg-accent-600 border-accent-600 text-white'
                  : 'bg-bg-1 border-border-subtle text-text-primary hover:bg-bg-2',
              ].join(' ')}
            >
              {k}
            </button>
          ))}
        </div>
        <Hint>
          Windows laptops have an Fn key, but the firmware (EC) consumes it before the OS sees it,
          so software can't reliably hook it. Right-Ctrl is the closest analog.
        </Hint>
      </Group>

      <Group title="Whisper model" subtitle="On-device speech-to-text. Larger = more accurate, slower.">
        <select
          value={draft.whisperModel}
          onChange={(e) => save({ whisperModel: e.target.value as AppSettings['whisperModel'] })}
          className="bg-bg-1 border border-border-subtle rounded-md px-3 py-2 text-sm text-text-primary"
        >
          <option value="tiny">Tiny (75 MB, fastest)</option>
          <option value="base">Base (150 MB)</option>
          <option value="small">Small (500 MB)</option>
          <option value="medium">Medium (1.5 GB)</option>
          <option value="large-v3-turbo">Large v3 Turbo (1.6 GB, best)</option>
        </select>
      </Group>

      <Group title="Worker URL" subtitle="Backend that proxies Claude + Whisper. Override to point at a local wrangler dev.">
        <input
          type="text"
          value={draft.workerUrl}
          onChange={(e) => setDraft({ ...draft, workerUrl: e.target.value })}
          onBlur={() => save({ workerUrl: draft.workerUrl })}
          className="w-full bg-bg-1 border border-border-subtle rounded-md px-3 py-2 text-sm font-mono text-text-primary"
        />
      </Group>

      <Group title="Direct API keys (optional)" subtitle="If set, bypass the Worker and call Anthropic / OpenAI directly.">
        <KeyField
          label="Anthropic API key"
          value={draft.anthropicApiKey ?? ''}
          onChange={(v) => save({ anthropicApiKey: v || null })}
        />
        <KeyField
          label="OpenAI API key (for Whisper)"
          value={draft.openaiApiKey ?? ''}
          onChange={(v) => save({ openaiApiKey: v || null })}
        />
      </Group>

      <Group title="Privacy" subtitle="Stealth mode hides the pill + cursor overlay from screen recordings.">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.stealthMode}
            onChange={(e) => save({ stealthMode: e.target.checked })}
          />
          Enable stealth mode
        </label>
      </Group>
    </div>
  );
}

function About() {
  return (
    <div className="max-w-2xl text-sm text-text-secondary flex flex-col gap-4">
      <h1 className="text-2xl text-text-primary font-medium">Keyfloe for Windows</h1>
      <p>
        Windows port of <a className="text-accent-400" href="https://github.com/danlhw/keyfloe" target="_blank" rel="noreferrer">danlhw/keyfloe</a>,
        the native macOS AI companion. Built on Electron + React + TypeScript, with the same Cloudflare Worker backend.
      </p>
      <p className="text-text-tertiary">
        Three modes: chat pill anchored to the cursor, push-to-talk dictation, and live interview helper with system-audio loopback.
      </p>
      <p className="text-text-tertiary text-xs">
        © 2026 Onefloe. UNLICENSED.
      </p>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-bg-1 border border-border-subtle rounded-lg px-4 py-3">
      <div className="text-text-tertiary text-xs uppercase tracking-wider">{label}</div>
      <div className="text-xl text-text-primary mt-1 font-mono">{value}</div>
    </div>
  );
}

function Group({ title, subtitle, children }: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-text-primary text-base font-medium">{title}</h2>
      {subtitle && <p className="text-text-tertiary text-xs -mt-1">{subtitle}</p>}
      <div className="flex flex-col gap-2 mt-1">{children}</div>
    </section>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="px-1.5 py-0.5 mx-0.5 text-xs bg-bg-2 border border-border-subtle rounded font-mono text-text-primary">
      {children}
    </kbd>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-text-tertiary text-xs leading-snug">{children}</p>
  );
}

function KeyField({ label, value, onChange }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-text-secondary text-xs">{label}</span>
      <input
        type="password"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => onChange(v)}
        placeholder="paste key, leave empty to use the Worker"
        className="bg-bg-1 border border-border-subtle rounded-md px-3 py-2 text-sm font-mono text-text-primary placeholder:text-text-tertiary"
      />
    </label>
  );
}

function time() {
  return new Date().toLocaleTimeString();
}
