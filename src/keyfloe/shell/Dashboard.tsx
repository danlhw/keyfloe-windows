/**
 * KeyfloeDashboard — the top-section panel. Mirrors the Mac
 * NavigationSplitView (app/Sources/Dashboard/DashboardView.swift): a
 * Departure-Mono sidebar on the left, the active tab on the right.
 *
 * Tabs match the Mac dashboard: Home, History, Cursor & Keys, Interview,
 * Account, Settings. Each tab accepts an optional `slot` so feature agents
 * inject their live content (see Tabs.tsx / INTEGRATION.md). Fully controlled
 * OR self-managed (leave `tab`/`onTab` unset to let it own its own state).
 */
import React, { useState } from "react";
import {
  Home as HomeIcon,
  History as HistoryIcon,
  Keyboard as KeyboardIcon,
  Radio as RadioIcon,
  User as UserIcon,
  Settings as SettingsIcon,
  type LucideIcon,
} from "lucide-react";
import { KeyfloeLogo } from "./components/KeyfloeLogo";
import {
  AccountTab,
  HistoryTab,
  HomeTab,
  InterviewTab,
  KeysTab,
  SettingsTab,
} from "./Tabs";

export type DashboardTab = "home" | "history" | "keys" | "interview" | "account" | "settings";

const TABS: { id: DashboardTab; label: string; icon: LucideIcon }[] = [
  { id: "home", label: "Home", icon: HomeIcon },
  { id: "history", label: "History", icon: HistoryIcon },
  { id: "keys", label: "Cursor & Keys", icon: KeyboardIcon },
  { id: "interview", label: "Interview", icon: RadioIcon },
  { id: "account", label: "Account", icon: UserIcon },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

export interface DashboardSlots {
  history?: React.ReactNode;
  keys?: React.ReactNode;
  interview?: React.ReactNode;
  /** Full override of the Account tab body. */
  account?: React.ReactNode;
  /** The Supabase sign-in form (auth/SignIn) — shown when signed out. */
  accountSignIn?: React.ReactNode;
  /** Me → Connections (auth/Connections) — shown when signed in. */
  connections?: React.ReactNode;
  settings?: React.ReactNode;
  interviewProfile?: React.ReactNode;
}

export interface DashboardAccount {
  email?: string;
  name?: string;
  plan?: string;
  unlimited?: boolean;
  usedToday?: number;
  dailyLimit?: number;
}

export function KeyfloeDashboard({
  tab,
  onTab,
  account,
  slots,
  onSignIn,
  onSignOut,
  /** force a theme; omit to follow the OS. */
  theme,
}: {
  tab?: DashboardTab;
  onTab?: (t: DashboardTab) => void;
  account?: DashboardAccount;
  slots?: DashboardSlots;
  onSignIn?: () => void;
  onSignOut?: () => void;
  theme?: "light" | "dark";
}) {
  const [internal, setInternal] = useState<DashboardTab>("home");
  const active = tab ?? internal;
  const setActive = (t: DashboardTab) => (onTab ? onTab(t) : setInternal(t));
  const themeClass = theme === "dark" ? " kf-dark" : theme === "light" ? " kf-light" : "";

  return (
    <div
      className={`kf-root kf-app-bg${themeClass}`}
      style={{ display: "flex", height: "100vh", width: "100%", overflow: "hidden" }}
    >
      {/* Sidebar */}
      <nav
        style={{
          width: 210, flex: "none", display: "flex", flexDirection: "column",
          padding: "20px 12px", gap: 4, borderRight: "1px solid var(--kf-hairline)",
        }}
      >
        <div style={{ padding: "4px 8px 18px" }}>
          <KeyfloeLogo height={22} />
        </div>
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <div
              key={t.id}
              className={`kf-sidebar-item${active === t.id ? " kf-active" : ""}`}
              onClick={() => setActive(t.id)}
            >
              <span style={{ width: 18, display: "flex", justifyContent: "center" }} aria-hidden>
                <Icon size={15} strokeWidth={1.75} />
              </span>
              <span>{t.label}</span>
            </div>
          );
        })}
        <div style={{ flex: 1 }} />
        <div className="kf-eyebrow" style={{ padding: "0 8px", fontSize: 9 }}>v0.1.0</div>
      </nav>

      {/* Active tab */}
      <main style={{ flex: 1, minWidth: 0 }}>
        {active === "home" && (
          <HomeTab account={account} interviewProfileSlot={slots?.interviewProfile} />
        )}
        {active === "history" && <HistoryTab slot={slots?.history} />}
        {active === "keys" && <KeysTab slot={slots?.keys} />}
        {active === "interview" && <InterviewTab slot={slots?.interview} />}
        {active === "account" && (
          <AccountTab
            account={account}
            slot={slots?.account}
            signInSlot={slots?.accountSignIn}
            connectionsSlot={slots?.connections}
            onSignIn={onSignIn}
            onSignOut={onSignOut}
          />
        )}
        {active === "settings" && <SettingsTab slot={slots?.settings} />}
      </main>
    </div>
  );
}
