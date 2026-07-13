/**
 * Keyfloe auth — Supabase sign-in + Stripe Pro gating + Composio connections.
 * Wrap the app in <AccountProvider/>, read state anywhere with useAccount(),
 * and mount <SignIn/> / <Connections/> into the Account tab. See INTEGRATION.
 */
export { AccountProvider, useAccount } from "./useAccount";
export type { Account, AccountContextValue } from "./useAccount";
export { SignIn } from "./SignIn";
export { Connections } from "./Connections";
