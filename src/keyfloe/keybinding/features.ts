// Built-in feature catalog for the binding UI. Mirrors the Mac `KeyFeature`
// enum (title/icon/blurb/useCase/isContinuous) from KeyboardCustomization.swift.

import {
  MessageSquare,
  Mic,
  Wand2,
  Sparkles,
  Waypoints,
  ScanLine,
  AppWindow,
  Radio,
  type LucideIcon,
} from "lucide-react";
import type { Feature } from "./types";

export interface FeatureMeta {
  id: Feature;
  title: string;
  blurb: string;
  useCase: string;
  icon: LucideIcon;
  continuous: boolean;
}

export const FEATURES: Record<Feature, FeatureMeta> = {
  chat: {
    id: "chat",
    title: "Chat",
    blurb: "Opens the chat popup by your cursor.",
    useCase: "“Rewrite this paragraph to be friendlier.”",
    icon: MessageSquare,
    continuous: false,
  },
  dictation: {
    id: "dictation",
    title: "Dictation",
    blurb: "Talk and Keyfloe types it where your cursor is.",
    useCase: "Hold, speak an email, release — it's typed for you.",
    icon: Mic,
    continuous: true,
  },
  snapshot: {
    id: "snapshot",
    title: "Snapshot AI",
    blurb: "Box a region on screen; Keyfloe answers what's inside.",
    useCase: "Snip a chart and ask what it means.",
    icon: ScanLine,
    continuous: false,
  },
  agent: {
    id: "agent",
    title: "Floe Agent",
    blurb: "Hold, speak a task, release — Floe runs it and reports back.",
    useCase: "“Find the cheapest flight to Tokyo next month.”",
    icon: Sparkles,
    continuous: true,
  },
  interview: {
    id: "interview",
    title: "Interview",
    blurb: "Live, private answers while you're on a call.",
    useCase: "Get talking points as questions come up.",
    icon: Radio,
    continuous: true,
  },
  ai_answer: {
    id: "ai_answer",
    title: "AI Answer",
    blurb: "Reads your screen and answers the question / fills the field.",
    useCase: "Tap on a form and let it fill the answer.",
    icon: Wand2,
    continuous: false,
  },
  voice_command: {
    id: "voice_command",
    title: "Voice Command",
    blurb: "Speak and Floe answers using what's on your screen.",
    useCase: "“Summarize this page out loud.”",
    icon: Waypoints,
    continuous: true,
  },
  dashboard: {
    id: "dashboard",
    title: "Dashboard",
    blurb: "Opens the Keyfloe dashboard.",
    useCase: "Jump to settings and history.",
    icon: AppWindow,
    continuous: false,
  },
};

export const FEATURE_ORDER: Feature[] = [
  "chat",
  "dictation",
  "snapshot",
  "agent",
  "interview",
  "ai_answer",
  "voice_command",
  "dashboard",
];

// Icon choices offered when building a custom feature (lucide names).
export const CUSTOM_ICON_CHOICES = [
  "Sparkles",
  "Wand2",
  "Text",
  "MessageCircle",
  "Globe",
  "BadgeCheck",
  "List",
  "Undo2",
  "Mail",
  "Zap",
  "Highlighter",
  "Quote",
] as const;
