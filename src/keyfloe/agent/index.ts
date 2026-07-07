// Feature C — Floe agent frontend, public surface.
//
// Mount <AgentPill /> wherever the pill lives; call useAgentStore.getState()
// .init() once at app start so it starts listening for agent events. Use
// <AgentComposer /> for a typed entry point, and useAgentStore for state.

export { AgentPill } from "./AgentPill";
export { AgentComposer } from "./AgentComposer";
export { AgentStepCard } from "./AgentStepCard";
export { AgentReportCard } from "./AgentReportCard";
export { useAgentStore, disposeAgentStore } from "./useAgentStore";
export * from "./types";
