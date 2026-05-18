/**
 * Dashboard — port of app/Sources/Dashboard/DashboardView.swift. Renders
 * the 7 visible tabs in a left sidebar + detail layout, matching the
 * Mac app's NavigationSplitView exactly.
 *
 * Sidebar:
 *   Home / Tasks / Profile / Dictations / Conversations / Billing / Settings
 *
 * Every tab is laid out on warm paper (--paper / --ink-900 in dark mode),
 * uses Fraunces display + Departure Mono eyebrows, and wraps its
 * sections in panel-sculpted cards. The Mac side is the source of truth
 * for copy + spacing — if something diverges, fix it here, not in the
 * design system.
 */
import { useEffect, useState } from 'react';
import type { AppSettings, ActivationKey } from '@shared/types';
import {
  EditorialEyebrow, DisplayTitle, EditorialDivider, EditorialCard,
  EditorialButton, TabHeader, StatusChip, SegmentedLoader, SectionHeading,
} from '../components/editorial';

type Tab =
  | 'home' | 'tasks' | 'profile' | 'dictations'
  | 'conversations' | 'billing' | 'settings';

const TABS: { id: Tab; label: string }[] = [
  { id: 'home',          label: 'Home' },
  { id: 'tasks',         label: 'Tasks' },
  { id: 'profile',       label: 'Profile' },
  { id: 'dictations',    label: 'Dictations' },
  { id: 'conversations', label: 'Conversations' },
  { id: 'billing',       label: 'Billing' },
  { id: 'settings',      label: 'Settings' },
];

export function Dashboard() {
  const [tab, setTab] = useState<Tab>('home');

  return (
    <div className="flex w-full h-full min-h-0 bg-paper">
      <Sidebar tab={tab} setTab={setTab} />
      <main className="flex-1 min-w-0 overflow-y-auto">
        {tab === 'home'          && <HomeTab />}
        {tab === 'tasks'         && <TasksTab />}
        {tab === 'profile'       && <ProfileTab />}
        {tab === 'dictations'    && <DictationsTab />}
        {tab === 'conversations' && <ConversationsTab />}
        {tab === 'billing'       && <BillingTab />}
        {tab === 'settings'      && <SettingsTab />}
      </main>
    </div>
  );
}

function Sidebar({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  return (
    <nav
      className="border-r border-hairline bg-paper py-6 px-3"
      style={{ width: 200, minWidth: 200 }}
    >
      <div className="px-3 pb-6">
        <span className="font-pixel text-eyebrow tracking-eyebrow uppercase text-ink-900">
          Keyfloe
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {TABS.map((it) => {
          const active = tab === it.id;
          return (
            <button
              key={it.id}
              onClick={() => setTab(it.id)}
              className={[
                'app-no-drag text-left px-3 py-2 rounded-sm',
                'pixel-eyebrow',
                active ? 'text-ink-900' : 'text-ink-600 hover:text-ink-900',
              ].join(' ')}
              style={active ? { background: 'var(--hairline)' } : undefined}
            >
              {it.label.toUpperCase()}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

// ─── HOME ──────────────────────────────────────────────────────────

function HomeTab() {
  return (
    <div
      className="px-10 py-9 flex flex-col gap-0"
      style={{ maxWidth: 1100 }}
    >
      <div className="flex items-center gap-3 pb-6">
        <StatusChip text="Running on Windows" variant="live" />
        <StatusChip text="Keyfloe" trailing="v0.1 · beta" variant="ink" />
      </div>

      <TabHeader
        eyebrow="Today"
        trailingEyebrow="Signature ’26"
        title="Your PC, with a "
        italic="memory."
      />

      <p
        className="text-ink-600 leading-relaxed pb-9"
        style={{ maxWidth: 640, fontSize: 15, lineHeight: 1.55 }}
      >
        Tap Right-Ctrl anywhere to chat. Hold Right-Ctrl to dictate. The
        pill listens, sees what's on screen, and helps without leaving
        the corner of your eye.
      </p>

      <EditorialDivider className="mb-8" />

      <div className="flex flex-col gap-6">
        <ActiveTasksCard />
        <MemoryPeekCard />
        <DictationStatsCard />
      </div>
    </div>
  );
}

function ActiveTasksCard() {
  return (
    <EditorialCard>
      <div className="flex items-center justify-between pb-1">
        <StatusChip text="Floe Agent" trailing="idle" variant="ghost" />
      </div>
      <p className="text-ink-600 leading-relaxed" style={{ fontSize: 13.5 }}>
        No tasks yet. Hold Right-Ctrl and tell the agent what to do —
        it runs in the background and lands a notification when it's done.
      </p>
    </EditorialCard>
  );
}

function MemoryPeekCard() {
  return (
    <EditorialCard>
      <div className="flex items-center justify-between pb-1">
        <StatusChip text="Memory" trailing="empty" variant="ghost" />
        <EditorialButton label="Edit" onClick={() => undefined} />
      </div>
      <p className="text-ink-600 leading-relaxed" style={{ fontSize: 13.5 }}>
        Nothing memorised yet. Tell the agent something durable —
        "I'm Daniel, my team is Onefloe" — and it'll save it here so
        the next conversation already knows.
      </p>
    </EditorialCard>
  );
}

function DictationStatsCard() {
  return (
    <EditorialCard>
      <div className="flex items-center justify-between pb-3">
        <StatusChip text="Dictation throughput" variant="ghost" />
        <span className="font-pixel text-eyebrow text-ink-400">last 7 days</span>
      </div>
      <div className="flex items-baseline gap-6 pb-3">
        <div>
          <div className="font-display text-display-md text-ink-900">0</div>
          <div className="pixel-eyebrow text-ink-400 pt-1">Words</div>
        </div>
        <div>
          <div className="font-display text-display-md text-ink-900">—</div>
          <div className="pixel-eyebrow text-ink-400 pt-1">WPM</div>
        </div>
        <div>
          <div className="font-display text-display-md text-ink-900">0</div>
          <div className="pixel-eyebrow text-ink-400 pt-1">Dictations</div>
        </div>
      </div>
      <SegmentedLoader mode="progress" progress={0} />
    </EditorialCard>
  );
}

// ─── TASKS ─────────────────────────────────────────────────────────

function TasksTab() {
  return (
    <div className="px-10 py-9" style={{ maxWidth: 1100 }}>
      <TabHeader
        eyebrow="Tasks"
        title="Floe Agent, "
        italic="working."
      />
      <EditorialCard>
        <p className="text-ink-600 leading-relaxed" style={{ fontSize: 14 }}>
          Background agent tasks aren't enabled in the Windows build yet.
          The Mac app uses AppleScript + Calendar + Mail + Messages to
          run multi-step automations; the Windows equivalent (Outlook
          COM + UI Automation) is in the roadmap — see <code>docs/PORT-NOTES.md</code>.
        </p>
        <p className="text-ink-600 pt-2" style={{ fontSize: 13 }}>
          For now, the pill chat + dictation + interview + Clicky
          pointer modes all work.
        </p>
      </EditorialCard>
    </div>
  );
}

// ─── PROFILE ───────────────────────────────────────────────────────

function ProfileTab() {
  const [resume, setResume] = useState('');
  // For the MVP we surface a local résumé text area that interview
  // mode reads. Full ProfilesView (Mac) supports multiple profiles +
  // JD attachments — slated for v0.2.
  useEffect(() => {
    const stored = localStorage.getItem('keyfloe.resume') ?? '';
    setResume(stored);
  }, []);
  function save(next: string) {
    setResume(next);
    localStorage.setItem('keyfloe.resume', next);
  }
  return (
    <div className="px-10 py-9 flex flex-col gap-6" style={{ maxWidth: 1100 }}>
      <TabHeader
        eyebrow="Profile"
        title="Who you are, "
        italic="to Keyfloe."
      />
      <EditorialCard>
        <SectionHeading title="Résumé / Notes" />
        <p className="text-ink-600 pb-2" style={{ fontSize: 13.5 }}>
          Anything you paste here goes into the system prompt for
          "How do I answer this?" during interview mode. Plain text,
          markdown, or bullet points all work.
        </p>
        <textarea
          value={resume}
          onChange={(e) => save(e.target.value)}
          placeholder="Paste your résumé, bullet-list your strengths, or jot down anything you'd want Keyfloe to remember about you in interviews…"
          className="w-full bg-paper text-ink-900 border border-hairline p-3 font-sans"
          style={{ minHeight: 240, resize: 'vertical', fontSize: 13.5, lineHeight: 1.55 }}
        />
      </EditorialCard>
    </div>
  );
}

// ─── DICTATIONS ────────────────────────────────────────────────────

interface DictationEntry { id: string; text: string; recordedAt: number; durationSec: number; pastedInto?: string; }

function DictationsTab() {
  const [entries, setEntries] = useState<DictationEntry[]>([]);
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem('keyfloe.dictations') ?? '[]') as DictationEntry[];
    setEntries(stored);
    const onUpdate = () => {
      const next = JSON.parse(localStorage.getItem('keyfloe.dictations') ?? '[]') as DictationEntry[];
      setEntries(next);
    };
    window.addEventListener('storage', onUpdate);
    const off = window.keyfloe.voice.onState((s) => {
      if (s.kind === 'idle') onUpdate();
    });
    return () => { window.removeEventListener('storage', onUpdate); off(); };
  }, []);

  const q = search.trim().toLowerCase();
  const filtered = q
    ? entries.filter((e) => e.text.toLowerCase().includes(q)
                         || (e.pastedInto?.toLowerCase().includes(q) ?? false))
    : entries;

  function copy(entry: DictationEntry) {
    navigator.clipboard.writeText(entry.text);
    setCopiedId(entry.id);
    setTimeout(() => setCopiedId((id) => id === entry.id ? null : id), 1500);
  }
  function remove(entry: DictationEntry) {
    const next = entries.filter((e) => e.id !== entry.id);
    setEntries(next);
    localStorage.setItem('keyfloe.dictations', JSON.stringify(next));
  }
  function clearAll() {
    setEntries([]);
    localStorage.setItem('keyfloe.dictations', '[]');
  }

  return (
    <div className="px-10 py-9 flex flex-col gap-6" style={{ maxWidth: 1100 }}>
      <div className="flex items-end justify-between">
        <div className="flex flex-col gap-1.5">
          <EditorialEyebrow text="Dictations" />
          <DisplayTitle leading="Every transcript, " italic="saved." size="md" />
        </div>
        {entries.length > 0 && (
          <EditorialButton label="Clear all" destructive onClick={clearAll} />
        )}
      </div>

      {entries.length === 0 ? (
        <EditorialCard>
          <h3 className="text-ink-900" style={{ fontSize: 16, fontWeight: 500 }}>
            Nothing dictated yet
          </h3>
          <p className="text-ink-600 leading-relaxed" style={{ fontSize: 14 }}>
            Hold your activation key and speak. Every transcript will
            appear here so you can copy it back if it landed in the
            wrong place. Auto-prunes after 30 days.
          </p>
        </EditorialCard>
      ) : (
        <>
          <div className="panel-sculpted px-3 py-2.5 flex items-center gap-2">
            <span className="text-ink-600">🔍</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search dictations…"
              className="flex-1 bg-transparent text-ink-900 outline-none"
              style={{ fontSize: 14 }}
            />
          </div>
          <div className="flex flex-col gap-3">
            {filtered.map((entry) => (
              <EditorialCard key={entry.id} inset={14}>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="text-ink-600" style={{ fontSize: 11, fontWeight: 500 }}>
                    {new Date(entry.recordedAt).toLocaleString()}
                  </span>
                  {entry.pastedInto && (
                    <span className="text-ink-400 border border-hairline px-1.5 py-0.5"
                          style={{ fontSize: 11 }}>
                      {entry.pastedInto}
                    </span>
                  )}
                  <span className="text-ink-400" style={{ fontSize: 11 }}>
                    {formatDuration(entry.durationSec)}
                  </span>
                  <div className="flex-1" />
                  <button
                    onClick={() => copy(entry)}
                    className="border border-hairline px-2 py-0.5 text-ink-900"
                    style={{ fontSize: 11, fontWeight: 500 }}
                  >
                    {copiedId === entry.id ? 'Copied!' : 'Copy'}
                  </button>
                  <button
                    onClick={() => remove(entry)}
                    className="border border-hairline w-[22px] h-[22px] text-ink-400 flex items-center justify-center"
                    style={{ fontSize: 10 }}
                  >
                    ✕
                  </button>
                </div>
                <p
                  className="text-ink-900 select-text whitespace-pre-wrap pt-2"
                  style={{ fontSize: 13 }}
                >
                  {entry.text}
                </p>
              </EditorialCard>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function formatDuration(s: number): string {
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}m ${sec}s`;
}

// ─── CONVERSATIONS ─────────────────────────────────────────────────

function ConversationsTab() {
  return (
    <div className="px-10 py-9 flex flex-col gap-6" style={{ maxWidth: 1100 }}>
      <div className="flex flex-col gap-1.5">
        <EditorialEyebrow text="Conversations" />
        <DisplayTitle leading="Every chat, " italic="kept." size="md" />
      </div>
      <EditorialDivider />
      <EditorialCard>
        <h3 className="text-ink-900" style={{ fontSize: 16, fontWeight: 500 }}>
          No conversations yet
        </h3>
        <p className="text-ink-600 leading-relaxed" style={{ fontSize: 14 }}>
          Tap Right-Ctrl to open the pill and ask anything. Each chat
          shows up here as a row.
        </p>
      </EditorialCard>
    </div>
  );
}

// ─── BILLING ───────────────────────────────────────────────────────

function BillingTab() {
  return (
    <div className="px-10 py-9 flex flex-col gap-6" style={{ maxWidth: 880 }}>
      <TabHeader
        eyebrow="Billing"
        trailingEyebrow="Three editions"
        title="Pick a "
        italic="tier."
      />
      <div className="grid grid-cols-3 gap-4">
        {[
          { name: 'Free',  price: '$0',  features: ['15 chat turns / day', 'Cloud Whisper', 'Right-Ctrl tap / hold'] },
          { name: 'Hobby', price: '$9',  features: ['Unlimited chat', 'Cloud Whisper', 'Interview mode'] },
          { name: 'Pro',   price: '$24', features: ['Everything in Hobby', 'Priority routing', 'Stealth mode', 'Sonnet for chat'] },
        ].map((tier) => (
          <EditorialCard key={tier.name}>
            <EditorialEyebrow text={tier.name} />
            <DisplayTitle leading={tier.price} italic=" / mo" size="md" />
            <ul className="flex flex-col gap-1.5 pt-2">
              {tier.features.map((f) => (
                <li key={f} className="text-ink-600" style={{ fontSize: 13.5 }}>
                  · {f}
                </li>
              ))}
            </ul>
            <div className="pt-3">
              <EditorialButton
                label={tier.name === 'Free' ? 'Current' : 'Coming soon'}
                solid={tier.name !== 'Free'}
                onClick={() => undefined}
              />
            </div>
          </EditorialCard>
        ))}
      </div>
      <p className="text-ink-400 pt-4" style={{ fontSize: 12 }}>
        Billing flows route through the same Lemon Squeezy webhook the
        Mac app uses. Wire-up is on the v0.2 milestone.
      </p>
    </div>
  );
}

// ─── SETTINGS ──────────────────────────────────────────────────────

function SettingsTab() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  useEffect(() => {
    window.keyfloe.settings.get().then(setSettings);
    const off = window.keyfloe.settings.onChange(setSettings);
    return () => off();
  }, []);
  async function save(patch: Partial<AppSettings>) {
    const next = await window.keyfloe.settings.set(patch);
    setSettings(next);
  }
  if (!settings) return <div className="p-10 text-ink-600">Loading…</div>;

  const keys: ActivationKey[] = ['RightCtrl', 'RightAlt', 'CapsLock', 'F8'];

  return (
    <div className="px-10 py-9 flex flex-col gap-0" style={{ maxWidth: 880 }}>
      <TabHeader
        eyebrow="Settings"
        trailingEyebrow="Configure"
        title="Make it "
        italic="yours."
      />

      <div className="flex flex-col gap-14">

        <EditorialCard>
          <SectionHeading title="Activation " italic="key." />
          <p className="text-ink-600" style={{ fontSize: 14 }}>
            Pick which key opens Keyfloe. Press once for the chat pill,
            hold to dictate.
          </p>
          <div className="flex gap-2 pt-2 flex-wrap">
            {keys.map((k) => {
              const active = settings.activationKey === k;
              return (
                <button
                  key={k}
                  onClick={() => save({ activationKey: k })}
                  className={[
                    'editorial-button app-no-drag',
                    active ? 'solid' : '',
                  ].join(' ')}
                >
                  {k.toUpperCase()}
                </button>
              );
            })}
          </div>
          <p className="text-ink-400 pt-2" style={{ fontSize: 12 }}>
            Windows laptops have an Fn key, but firmware (the EC) consumes
            it before the OS sees it, so software hooks can't read it.
            Right-Ctrl is the closest analog.
          </p>
        </EditorialCard>

        <EditorialCard>
          <SectionHeading title="Speech " italic="model." />
          <p className="text-ink-600" style={{ fontSize: 14 }}>
            Whisper is run on the Cloudflare Worker for now. On-device
            whisper.cpp with DirectML acceleration is in the roadmap.
          </p>
          <select
            value={settings.whisperModel}
            onChange={(e) => save({ whisperModel: e.target.value as AppSettings['whisperModel'] })}
            className="border border-hairline bg-paper text-ink-900 px-3 py-2 mt-2"
            style={{ fontSize: 14 }}
          >
            <option value="tiny">Tiny (75 MB, fastest)</option>
            <option value="base">Base (150 MB)</option>
            <option value="small">Small (500 MB)</option>
            <option value="medium">Medium (1.5 GB)</option>
            <option value="large-v3-turbo">Large v3 Turbo (1.6 GB, best)</option>
          </select>
        </EditorialCard>

        <EditorialCard>
          <SectionHeading title="Stealth " italic="mode." />
          <p className="text-ink-600" style={{ fontSize: 14 }}>
            Hides the pill and cursor overlay from screen recordings.
          </p>
          <label className="flex items-center gap-2 pt-2 text-ink-900" style={{ fontSize: 14 }}>
            <input
              type="checkbox"
              checked={settings.stealthMode}
              onChange={(e) => save({ stealthMode: e.target.checked })}
            />
            Enable stealth mode
          </label>
        </EditorialCard>

        <EditorialCard>
          <SectionHeading title="API " italic="keys." />
          <p className="text-ink-600" style={{ fontSize: 14 }}>
            Optional. If set, Keyfloe calls Anthropic / OpenAI directly
            and bypasses the Cloudflare Worker's free-tier quota.
          </p>
          <div className="flex flex-col gap-2 pt-2">
            <KeyField
              label="Anthropic API key"
              value={settings.anthropicApiKey ?? ''}
              onChange={(v) => save({ anthropicApiKey: v || null })}
            />
            <KeyField
              label="OpenAI API key (for Whisper)"
              value={settings.openaiApiKey ?? ''}
              onChange={(v) => save({ openaiApiKey: v || null })}
            />
          </div>
        </EditorialCard>

        <EditorialCard>
          <SectionHeading title="Worker " italic="URL." />
          <p className="text-ink-600" style={{ fontSize: 14 }}>
            Backend that proxies Claude + Whisper. Override to point
            at a local <code>wrangler dev</code>.
          </p>
          <input
            type="text"
            defaultValue={settings.workerUrl}
            onBlur={(e) => save({ workerUrl: e.target.value })}
            className="w-full border border-hairline bg-paper text-ink-900 px-3 py-2 mt-2 font-pixel"
            style={{ fontSize: 13 }}
          />
        </EditorialCard>
      </div>
    </div>
  );
}

function KeyField({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <label className="flex flex-col gap-1">
      <span className="pixel-eyebrow text-ink-600">{label}</span>
      <input
        type="password"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => onChange(v)}
        placeholder="paste key, leave empty to use the Worker"
        className="border border-hairline bg-paper text-ink-900 px-3 py-2 font-pixel"
        style={{ fontSize: 13 }}
      />
    </label>
  );
}

