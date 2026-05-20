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
  // Persists to electron-store via the settings IPC so interview.askAnswer
  // (in main) can read the same string without a separate round-trip.
  // Full ProfilesView (Mac) supports multiple profiles + JD attachments — slated for v0.2.
  useEffect(() => {
    let cancelled = false;
    window.keyfloe.settings.get().then((s) => {
      if (!cancelled) setResume(s.interviewResume ?? '');
    });
    return () => { cancelled = true; };
  }, []);
  function save(next: string) {
    setResume(next);
    window.keyfloe.settings.set({ interviewResume: next });
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
  // Tiers mirror the Mac BillingView.swift exactly:
  //   Free  $0/mo  $0/yr  — "For tasting the app."
  //   Hobby $9.99  $89    — "For everyone who wants Floe to be magical."
  //   Pro   $15    $129   — "For power users, interviewers, and Clicky."
  // Pro sits in the popular middle slot, slightly elevated.
  const [period, setPeriod] = useState<'monthly' | 'yearly'>('yearly');
  type Plan = { id: 'free' | 'hobby' | 'pro'; name: string; tagline: string;
                monthly: number; yearly: number; features: string[]; cta: string; popular?: boolean; };
  const plans: Plan[] = [
    {
      id: 'free', name: 'Free', tagline: 'For tasting the app.',
      monthly: 0, yearly: 0,
      features: ['15 chat turns / day', 'Cloud Whisper dictation', 'Cursor overlay', 'Interview mode (limited)'],
      cta: 'JUST DOWNLOAD',
    },
    {
      id: 'pro', name: 'Pro', tagline: 'For power users, interviewers, and anyone who wants Clicky to take action.',
      monthly: 15, yearly: 129,
      features: ['Everything in Hobby', 'Stealth mode (invisible in Zoom/Meet)', 'Priority Sonnet routing', 'Unlimited interview transcripts', 'Computer Use clicking'],
      cta: 'GO PRO',
      popular: true,
    },
    {
      id: 'hobby', name: 'Hobby', tagline: 'For everyone who wants Floe to be magical day-to-day.',
      monthly: 9.99, yearly: 89,
      features: ['Unlimited chat', 'Cloud Whisper dictation', 'Interview mode (full)', 'Cursor overlay'],
      cta: 'START WITH HOBBY',
    },
  ];

  return (
    <div className="px-10 py-9 flex flex-col gap-8" style={{ maxWidth: 980 }}>
      <TabHeader
        eyebrow="Billing"
        trailingEyebrow="Three editions"
        title="Pick a "
        italic="tier."
      />

      {/* Monthly / Yearly toggle */}
      <div className="flex justify-center">
        <div className="inline-flex rounded-full border border-hairline overflow-hidden">
          {(['monthly', 'yearly'] as const).map((p) => {
            const on = period === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className="font-pixel px-5 py-2 transition"
                style={{
                  fontSize: 10.5, letterSpacing: '0.16em',
                  background: on ? 'var(--ink-900)' : 'transparent',
                  color: on ? 'var(--paper)' : 'var(--ink-600)',
                }}
              >
                {p === 'monthly' ? 'MONTHLY' : 'YEARLY · SAVE 25%'}
              </button>
            );
          })}
        </div>
      </div>

      {/* Plan grid — Pro in middle, slightly elevated */}
      <div className="grid grid-cols-3 gap-5 items-stretch">
        {plans.map((plan) => {
          const isPro = plan.id === 'pro';
          const price = period === 'monthly' ? plan.monthly : plan.yearly / 12;
          const priceLabel = price === 0 ? '$0' : `$${price < 1 ? price.toFixed(0) : price.toFixed(2)}`;
          return (
            <div
              key={plan.id}
              className={[
                'rounded-2xl p-6 flex flex-col gap-3 transition',
                'border border-hairline',
                isPro ? 'bg-ink-900 text-paper -mt-2' : 'bg-paper text-ink-900',
              ].join(' ')}
              style={{
                boxShadow: isPro
                  ? '0 12px 32px rgba(10,10,11,0.28), inset 0 1px 0 rgba(255,255,255,0.10)'
                  : '0 4px 16px rgba(10,10,11,0.08)',
              }}
            >
              {isPro && (
                <div className="font-pixel self-start" style={{
                  fontSize: 9, letterSpacing: '0.2em',
                  padding: '3px 8px', borderRadius: 999,
                  background: 'color-mix(in srgb, var(--paper) 18%, transparent)',
                  color: 'var(--paper)',
                }}>MOST CHOSEN</div>
              )}
              <div className="font-pixel" style={{ fontSize: 10.5, letterSpacing: '0.18em',
                  color: isPro ? 'color-mix(in srgb, var(--paper) 70%, transparent)' : 'var(--ink-600)' }}>
                {plan.name.toUpperCase()}
              </div>
              <div className="flex items-baseline gap-1">
                <span className="font-display" style={{ fontSize: 44, lineHeight: 1, fontWeight: 300 }}>
                  {priceLabel}
                </span>
                <span style={{ fontSize: 12, opacity: 0.7 }}>/ mo</span>
              </div>
              {period === 'yearly' && price > 0 && (
                <div style={{ fontSize: 11, opacity: 0.7 }}>billed ${plan.yearly} yearly</div>
              )}
              <p style={{ fontSize: 13, lineHeight: 1.45, opacity: 0.85 }}>{plan.tagline}</p>
              <ul className="flex flex-col gap-1.5 pt-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2" style={{ fontSize: 12.5, lineHeight: 1.4 }}>
                    <span style={{ opacity: 0.6 }}>·</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <div className="pt-3 mt-auto">
                <button
                  type="button"
                  onClick={() => {
                    if (plan.id === 'free') return;
                    // TODO v0.2 — wire Lemon Squeezy checkout URLs.
                    window.open('https://keyfloe.com/#pricing', '_blank');
                  }}
                  className={[
                    'w-full font-pixel rounded-lg py-3 transition',
                    isPro
                      ? 'bg-paper text-ink-900 hover:brightness-95'
                      : 'bg-ink-900 text-paper hover:brightness-110',
                  ].join(' ')}
                  style={{ fontSize: 11, letterSpacing: '0.18em' }}
                >
                  {plan.cta}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-ink-400 pt-2 text-center" style={{ fontSize: 12 }}>
        Same Lemon Squeezy checkout the Mac app uses. Cancel anytime.
      </p>
    </div>
  );
}

// ─── SETTINGS ──────────────────────────────────────────────────────
// Matches Mac SettingsView.swift sections: Activation key, Appearance,
// Stealth mode, Privacy & Data. NO API key fields — Keyfloe routes all
// traffic through the Worker. NO Worker URL field (advanced users can
// edit config.json directly).

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

  const keys: { key: ActivationKey; label: string; hint?: string }[] = [
    { key: 'RightAlt',  label: 'RIGHT ALT',  hint: 'recommended — works on MacBook (right Option) and any Windows keyboard' },
    { key: 'RightCtrl', label: 'RIGHT CTRL', hint: 'most Windows keyboards; not on MacBook' },
    { key: 'CapsLock',  label: 'CAPS LOCK',  hint: 'replaces normal Caps Lock' },
    { key: 'F8',        label: 'F8',         hint: 'safe on every keyboard' },
  ];

  return (
    <div className="px-10 py-9 flex flex-col gap-0" style={{ maxWidth: 880 }}>
      <TabHeader
        eyebrow="Settings"
        trailingEyebrow="Configure"
        title="Make it "
        italic="yours."
      />

      <div className="flex flex-col gap-14">
        {/* Activation key */}
        <EditorialCard>
          <SectionHeading title="Activation " italic="key." />
          <p className="text-ink-600" style={{ fontSize: 14 }}>
            Pick which key opens Keyfloe. Tap to open the chat pill,
            hold to dictate.
          </p>
          <div className="flex flex-col gap-2 pt-3">
            {keys.map(({ key, label, hint }) => {
              const active = settings.activationKey === key;
              return (
                <button
                  key={key}
                  onClick={() => save({ activationKey: key })}
                  className={[
                    'app-no-drag flex items-center justify-between px-4 py-3 rounded-lg border transition',
                    active
                      ? 'border-ink-900 bg-ink-900 text-paper'
                      : 'border-hairline bg-bone text-ink-900 hover:bg-paper',
                  ].join(' ')}
                  style={{ fontSize: 13 }}
                >
                  <span className="font-pixel" style={{ letterSpacing: '0.16em' }}>{label}</span>
                  <span style={{ fontSize: 11, opacity: 0.7 }}>{hint}</span>
                </button>
              );
            })}
          </div>
          <p className="text-ink-400 pt-3" style={{ fontSize: 12 }}>
            Note: Windows can't see the Fn key (firmware swallows it before the OS sees it).
            Right-Alt is the closest analog and works through Parallels too.
          </p>
        </EditorialCard>

        {/* Appearance */}
        <EditorialCard>
          <SectionHeading title="Appearance." />
          <p className="text-ink-600" style={{ fontSize: 14 }}>
            Light, dark, or follow your Windows setting.
          </p>
          <RadioRow
            value={settings.appearance}
            onChange={(v) => save({ appearance: v as AppSettings['appearance'] })}
            options={[
              { value: 'system', label: 'Follow system' },
              { value: 'light',  label: 'Always light' },
              { value: 'dark',   label: 'Always dark' },
            ]}
          />
        </EditorialCard>

        {/* Stealth mode */}
        <EditorialCard>
          <div className="flex items-center justify-between">
            <SectionHeading title="Stealth " italic="mode." />
            <ProBadge />
          </div>
          <p className="text-ink-600" style={{ fontSize: 14 }}>
            Hides the Keyfloe pill and cursor overlay from screen recordings
            (Zoom, Meet, Teams, OBS — every tool that uses the standard
            Windows capture pipeline). Pro users are stealth by default
            whenever the pill is open.
          </p>
          <RadioRow
            value={settings.stealthMode}
            onChange={(v) => save({ stealthMode: v as AppSettings['stealthMode'] })}
            options={[
              { value: 'auto',       label: 'Default — invisible when the pill is open' },
              { value: 'always-on',  label: 'Always invisible to screen recordings' },
              { value: 'always-off', label: 'Always visible' },
            ]}
          />
        </EditorialCard>

        {/* Dictation */}
        <EditorialCard>
          <SectionHeading title="Dictation" italic=" (push-to-talk)." />
          <p className="text-ink-600" style={{ fontSize: 14 }}>
            Hold the activation key anywhere on your PC to speak. Release and
            the transcribed text pastes into whatever text field has focus —
            Slack, Outlook, the Keyfloe pill, anywhere.
          </p>
          <p className="text-ink-400 pt-2" style={{ fontSize: 12 }}>
            Transcription runs on our server for now. On-device whisper.cpp
            with GPU acceleration is on the v0.2 roadmap.
          </p>
        </EditorialCard>

        {/* Intelligence */}
        <EditorialCard>
          <SectionHeading title="Intelligence." />
          <p className="text-ink-600" style={{ fontSize: 14 }}>
            Default replies use a fast, cheap model so the pill answers in a
            beat. Flip the brain icon in the pill to switch to a heavier
            model for deeper reasoning.
          </p>
        </EditorialCard>

        {/* Privacy & Data */}
        <EditorialCard>
          <SectionHeading title="Privacy & " italic="data." />
          <p className="text-ink-600" style={{ fontSize: 14 }}>
            Keyfloe stores conversations + dictation history locally on your
            PC under <code className="font-pixel">%APPDATA%\Keyfloe</code>.
            None of it is uploaded.
          </p>
          <div className="flex flex-wrap gap-2 pt-3">
            <button
              type="button"
              className="editorial-button app-no-drag"
              onClick={() => {
                if (confirm('Clear all dictation history? This cannot be undone.')) {
                  localStorage.removeItem('keyfloe.dictations');
                  window.dispatchEvent(new Event('storage'));
                }
              }}
            >
              Clear dictations
            </button>
            <button
              type="button"
              className="editorial-button app-no-drag"
              onClick={() => {
                if (confirm('Clear all chat conversations? This cannot be undone.')) {
                  localStorage.removeItem('keyfloe.conversations');
                  window.dispatchEvent(new Event('storage'));
                }
              }}
            >
              Clear conversations
            </button>
          </div>
        </EditorialCard>
      </div>
    </div>
  );
}

function RadioRow({
  value, onChange, options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1.5 pt-3">
      {options.map((opt) => {
        const on = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={[
              'app-no-drag flex items-center gap-3 px-3 py-2.5 rounded-lg border transition text-left',
              on ? 'border-ink-900 bg-bone' : 'border-hairline bg-paper hover:bg-bone',
            ].join(' ')}
            style={{ fontSize: 13 }}
          >
            <span
              className="flex items-center justify-center"
              style={{
                width: 16, height: 16, borderRadius: 999,
                border: '1.5px solid var(--ink-900)',
              }}
            >
              {on && <span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--ink-900)' }} />}
            </span>
            <span className="text-ink-900">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function ProBadge() {
  return (
    <span
      className="font-pixel"
      style={{
        fontSize: 9, letterSpacing: '0.18em',
        padding: '3px 8px', borderRadius: 999,
        background: 'var(--ink-900)', color: 'var(--paper)',
      }}
    >
      PRO
    </span>
  );
}

