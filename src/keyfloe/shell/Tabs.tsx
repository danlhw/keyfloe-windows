/**
 * Dashboard tab bodies — 1:1 with the Mac dashboard tabs
 * (app/Sources/Dashboard/Tabs/): Home, History (dictation + AI answers),
 * Cursor & Keys (the remapper), Interview, Account, Settings.
 *
 * These are the branded SHELLS. Feature agents (B dictation, C agent,
 * D interview, F keybinding) inject their live content through the
 * optional `slot` render-props — without a slot each tab shows a
 * branded empty/placeholder state so the shell is previewable today.
 */
import React, { useState } from "react";
import { Chip, DisplayTitle, Eyebrow, Panel } from "./components/primitives";
import { KeyfloeKeyboard } from "./components/KeyfloeKeyboard";
import { KEY_ACTIONS, KeyActionDef } from "./keyActions";

/* Shared tab scaffold: eyebrow + big title + right-aligned header slot. */
function TabHeader({
  eyebrow,
  title,
  accent,
  right,
}: {
  eyebrow: string;
  title: string;
  accent?: string;
  right?: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 28 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <DisplayTitle lead={title} accent={accent} size={30} />
      </div>
      {right ? <div style={{ display: "flex", gap: 8, alignItems: "center" }}>{right}</div> : null}
    </div>
  );
}

function TabScroll({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "36px 40px 80px" }}>{children}</div>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <Panel style={{ padding: 28, display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 15, fontWeight: 600 }}>{title}</span>
      <span className="kf-muted" style={{ fontSize: 13, lineHeight: 1.5 }}>{body}</span>
    </Panel>
  );
}

/* ── HOME ─────────────────────────────────────────────────────────────── */
function BinderRow({
  action,
  selected,
  onSelect,
}: {
  action: KeyActionDef;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      className="kf-panel"
      style={{
        padding: 14, cursor: "pointer",
        background: selected ? "var(--kf-bone)" : "var(--kf-panel-fill)",
        borderColor: selected ? "rgba(127,127,127,0.4)" : undefined,
        display: "flex", flexDirection: "column", gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ width: 34, height: 34, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: selected ? "var(--kf-ink-900)" : "var(--kf-bone)", color: selected ? "var(--kf-paper)" : "var(--kf-ink-600)", fontSize: 16, flex: "none" }}>
          {action.icon}
        </span>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
          <span style={{ fontSize: 13.5, fontWeight: 600 }}>{action.title}</span>
          <span className="kf-muted" style={{ fontSize: 11 }}>{action.subtitle}</span>
        </div>
        <span className="kf-chip">{action.defaultTrigger === "hold" ? "Hold" : "Tap"}</span>
        <span className="kf-chip">{action.defaultKeyName}</span>
      </div>
    </div>
  );
}

export function HomeTab({
  account,
  interviewProfileSlot,
}: {
  account?: { email?: string; usedToday?: number; dailyLimit?: number; unlimited?: boolean };
  interviewProfileSlot?: React.ReactNode;
}) {
  const [selected, setSelected] = useState(KEY_ACTIONS[0].id);
  const sel = KEY_ACTIONS.find((a) => a.id === selected) ?? KEY_ACTIONS[0];

  const tasksChip = account?.unlimited
    ? "∞ unlimited"
    : account?.usedToday != null && account?.dailyLimit != null
    ? `${account.usedToday} / ${account.dailyLimit} today`
    : null;

  return (
    <TabScroll>
      <TabHeader
        eyebrow="Keyfloe"
        title="Pick your keys."
        right={
          <>
            {tasksChip ? <Chip title="AI tasks used today">{tasksChip}</Chip> : null}
            {account?.email ? (
              <Chip dot="var(--kf-green)">{account.email}</Chip>
            ) : (
              <Chip dot="var(--kf-gold)" title="Hotkeys fire once you sign in">Sign in to unlock</Chip>
            )}
          </>
        }
      />

      {/* Key binder */}
      <Panel style={{ padding: 20, marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
          <Eyebrow>Your keys</Eyebrow>
          <Eyebrow>Click a feature to see its key</Eyebrow>
        </div>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <KeyfloeKeyboard highlightedIds={[sel.defaultKeyId]} platform="windows" />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
          {KEY_ACTIONS.map((a) => (
            <BinderRow key={a.id} action={a} selected={a.id === selected} onSelect={() => setSelected(a.id)} />
          ))}
        </div>
        <p className="kf-muted" style={{ fontSize: 12, lineHeight: 1.5, marginTop: 14 }}>{sel.description}</p>
      </Panel>

      {/* Interview profile shortcut (feature D can inject a live card). */}
      {interviewProfileSlot ?? (
        <Panel style={{ padding: 16, display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ width: 34, height: 34, borderRadius: 9, background: "var(--kf-bone)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>👤</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Interview profile</div>
            <div className="kf-muted" style={{ fontSize: 11.5 }}>Add your résumé &amp; job description so interview answers are tailored to you.</div>
          </div>
          <span className="kf-muted" style={{ fontSize: 11.5 }}>Add résumé ›</span>
        </Panel>
      )}
    </TabScroll>
  );
}

/* ── HISTORY (dictation + AI answers) ─────────────────────────────────── */
export function HistoryTab({ slot }: { slot?: React.ReactNode }) {
  return (
    <TabScroll>
      <TabHeader eyebrow="History" title="Everything Keyfloe " accent="typed." />
      {slot ?? (
        <EmptyState
          title="No history yet"
          body="Every dictation and AI answer Keyfloe pastes shows up here, ready to re-copy. Hold your dictation key and talk, or press your chat key to ask a question."
        />
      )}
    </TabScroll>
  );
}

/* ── CURSOR & KEYS (the remapper) ─────────────────────────────────────── */
export function KeysTab({ slot }: { slot?: React.ReactNode }) {
  const [selected, setSelected] = useState(KEY_ACTIONS[0].id);
  const sel = KEY_ACTIONS.find((a) => a.id === selected) ?? KEY_ACTIONS[0];
  return (
    <TabScroll>
      <TabHeader eyebrow="Cursor & Keys" title="Give any key a " accent="skill." />
      {slot ?? (
        <Panel style={{ padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <KeyfloeKeyboard highlightedIds={[sel.defaultKeyId]} platform="windows" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
            {KEY_ACTIONS.map((a) => (
              <BinderRow key={a.id} action={a} selected={a.id === selected} onSelect={() => setSelected(a.id)} />
            ))}
          </div>
          <p className="kf-muted" style={{ fontSize: 12, marginTop: 12 }}>
            Click a feature to see its key. Remapping to a different key is wired by the keybinding
            module — this shell renders the current bindings.
          </p>
        </Panel>
      )}
    </TabScroll>
  );
}

/* ── INTERVIEW ────────────────────────────────────────────────────────── */
export function InterviewTab({ slot }: { slot?: React.ReactNode }) {
  return (
    <TabScroll>
      <TabHeader eyebrow="Interview" title="Answers, " accent="live." />
      {slot ?? (
        <EmptyState
          title="Interview mode is ready"
          body="Start a call, turn on interview mode from the chat popup, and Keyfloe listens, transcribes what's said, and drafts a tailored answer in real time — invisible to screen-share. Load a profile on Home first for answers tuned to you."
        />
      )}
    </TabScroll>
  );
}

/* ── ACCOUNT (Me) ─────────────────────────────────────────────────────── */
export function AccountTab({
  account,
  onSignIn,
  onSignOut,
  signInSlot,
  connectionsSlot,
  slot,
}: {
  account?: { email?: string; name?: string; plan?: string; unlimited?: boolean };
  onSignIn?: () => void;
  onSignOut?: () => void;
  /** The real Supabase sign-in form (auth/SignIn) — shown when signed out. */
  signInSlot?: React.ReactNode;
  /** Me → Connections (auth/Connections) — shown when signed in. */
  connectionsSlot?: React.ReactNode;
  slot?: React.ReactNode;
}) {
  if (slot) {
    return (
      <TabScroll>
        <TabHeader eyebrow="Account" title="Your " accent="Keyfloe." />
        {slot}
      </TabScroll>
    );
  }

  const signedIn = !!account?.email;
  const planLabel = account?.unlimited
    ? "Pro · unlimited"
    : account?.plan
    ? account.plan.charAt(0).toUpperCase() + account.plan.slice(1)
    : "Free";

  return (
    <TabScroll>
      <TabHeader eyebrow="Account" title="Your " accent="Keyfloe." />
      {signedIn ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <Panel style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Chip dot="var(--kf-green)">Signed in</Chip>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{account!.name || account!.email}</span>
              {account!.name ? <span className="kf-muted" style={{ fontSize: 12.5 }}>{account!.email}</span> : null}
            </div>
            <span className="kf-muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
              Plan: {planLabel}. Your dictation, AI answers and key bindings sync to this account.
              A Pro plan on Mac is Pro here too.
            </span>
            <button className="kf-btn kf-btn-secondary" style={{ alignSelf: "flex-start" }} onClick={onSignOut}>
              Sign out
            </button>
          </Panel>
          {connectionsSlot ? (
            <Panel style={{ padding: 24 }}>{connectionsSlot}</Panel>
          ) : null}
        </div>
      ) : (
        signInSlot ?? (
          <Panel style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14, maxWidth: 420 }}>
            <Eyebrow>Sign in · required for hotkeys</Eyebrow>
            <span className="kf-muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
              Keyfloe's hotkeys (Ctrl, Alt, Caps Lock, Menu) only fire once you sign in. Sign in to
              sync your stats, history and bindings across devices.
            </span>
            <button className="kf-btn kf-btn-primary" style={{ alignSelf: "flex-start" }} onClick={onSignIn}>
              Sign in
            </button>
          </Panel>
        )
      )}
    </TabScroll>
  );
}

/* ── SETTINGS ─────────────────────────────────────────────────────────── */
export function SettingsTab({ slot }: { slot?: React.ReactNode }) {
  return (
    <TabScroll>
      <TabHeader eyebrow="Settings" title="Make it " accent="yours." />
      {slot ?? (
        <EmptyState
          title="Settings live here"
          body="Microphone, dictation model, language, startup, paste method, sounds, appearance and updates — plus AI-polish, custom vocabulary and your dictation stats. All of it mounts into this branded shell."
        />
      )}
    </TabScroll>
  );
}
