/**
 * useAccount — the one account/auth context the whole Windows FE reads.
 *
 * Auth + billing are SHARED with the Mac app and the site: sign in with
 * Supabase, Pro status flows from Stripe via the Worker's self-healing `/me`
 * (PRD 5.8). This module does NOT talk to Supabase/Stripe directly — the JWT +
 * device id are persisted securely by the Rust AuthState (Windows Credential
 * Manager via the `keyring` crate, P1-05) and every network call goes through
 * the backend so the token never touches JS. The FE just calls the auth
 * commands and mirrors the resulting plan/limits into React.
 *
 * Backend commands this expects (owned by the auth-backend task P1-05 —
 * see integration_notes; names are stable so both sides can align):
 *   keyfloe_auth_me()                         -> Account | null
 *   keyfloe_auth_login_email(email,password)  -> Account
 *   keyfloe_auth_login_google()               -> Account   (opens browser, loopback)
 *   keyfloe_auth_logout()                     -> void
 *
 * Free vs Pro gating lives here (`isPro`, `canUse`) so panels enforce limits
 * the same place the Mac app does.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export interface Account {
  email?: string;
  name?: string;
  /** "free" | "hobby" | "pro" (matches the Worker). */
  plan?: string;
  unlimited?: boolean;
  usedToday?: number;
  dailyLimit?: number;
}

export interface AccountContextValue {
  account: Account | null;
  loading: boolean;
  error: string | null;
  signedIn: boolean;
  isPro: boolean;
  /** false only when a hard daily limit is reached for a free/hobby user. */
  canUse: boolean;
  refresh: () => Promise<void>;
  signInEmail: (email: string, password: string) => Promise<void>;
  signInGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

async function invokeCmd<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

const AccountContext = createContext<AccountContextValue | null>(null);

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isTauri()) {
      setLoading(false);
      return;
    }
    try {
      const me = await invokeCmd<Account | null>("keyfloe_auth_me");
      setAccount(me ?? null);
      setError(null);
    } catch (e) {
      // Not signed in / offline — treated as signed-out, not a hard error.
      setAccount(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signInEmail = useCallback(
    async (email: string, password: string) => {
      setError(null);
      try {
        const me = await invokeCmd<Account>("keyfloe_auth_login_email", {
          email,
          password,
        });
        setAccount(me);
      } catch (e) {
        const msg = String((e as any)?.message ?? e);
        setError(msg || "Sign in failed. Check your email and password.");
        throw e;
      }
    },
    [],
  );

  const signInGoogle = useCallback(async () => {
    setError(null);
    try {
      const me = await invokeCmd<Account>("keyfloe_auth_login_google");
      setAccount(me);
    } catch (e) {
      const msg = String((e as any)?.message ?? e);
      setError(msg || "Google sign in failed.");
      throw e;
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await invokeCmd<void>("keyfloe_auth_logout");
    } finally {
      setAccount(null);
    }
  }, []);

  const value = useMemo<AccountContextValue>(() => {
    const signedIn = !!account?.email;
    const isPro = !!account?.unlimited || account?.plan === "pro";
    const canUse =
      isPro ||
      account?.usedToday == null ||
      account?.dailyLimit == null ||
      account.usedToday < account.dailyLimit;
    return {
      account,
      loading,
      error,
      signedIn,
      isPro,
      canUse,
      refresh,
      signInEmail,
      signInGoogle,
      signOut,
    };
  }, [account, loading, error, refresh, signInEmail, signInGoogle, signOut]);

  return React.createElement(AccountContext.Provider, { value }, children);
}

export function useAccount(): AccountContextValue {
  const ctx = useContext(AccountContext);
  if (!ctx) {
    // Allow use outside a provider (e.g. isolated preview) with a safe default.
    return {
      account: null,
      loading: false,
      error: null,
      signedIn: false,
      isPro: false,
      canUse: true,
      refresh: async () => {},
      signInEmail: async () => {},
      signInGoogle: async () => {},
      signOut: async () => {},
    };
  }
  return ctx;
}
