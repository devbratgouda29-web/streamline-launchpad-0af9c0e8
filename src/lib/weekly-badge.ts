// Weekly Mastery Badge system — evaluates the user's active rank badge from
// weekly focus hours and provides helpers for aggregation + monthly rollups.

export type WeeklyTierId = "novice" | "expert" | "vanguard" | "iron" | "apex";

export type WeeklyTier = {
  id: WeeklyTierId;
  tier: 1 | 2 | 3 | 4 | 5;
  name: string;
  tagline: string;
  description: string;
  min: number; // inclusive hours
  max: number; // exclusive hours (Infinity for top)
  image: string;
  accent: string; // tailwind text color class
  glow: string; // css color for shadow/glow
};

/**
 * Minimum weekly focus hours required to enter Tier 1 (Novice Scholar).
 * Below this threshold the user is UNRANKED — no tier, no badge.
 */
export const UNRANKED_MIN_HOURS = 20;
export const UNRANKED_LABEL = "UNRANKED";

export const WEEKLY_TIERS: WeeklyTier[] = [
  {
    id: "novice",
    tier: 1,
    name: "Novice Scholar",
    tagline: "The path begins.",
    description:
      "The first rung of the ladder. Light but consistent weekly focus builds the habit before it builds the results.",
    min: UNRANKED_MIN_HOURS,
    max: 30,
    image: "/badges/novice-scholar.png",
    accent: "text-amber-500",
    glow: "rgba(217, 119, 6, 0.45)",
  },

  {
    id: "expert",
    tier: 2,
    name: "Expert Scholar",
    tagline: "Knowledge sharpened by repetition.",
    description:
      "Repetition has become routine. Sessions are longer, recall is sharper, and momentum starts compounding week over week.",
    min: 30,
    max: 40,
    image: "/badges/expert-scholar.png",
    accent: "text-amber-300",
    glow: "rgba(253, 186, 116, 0.55)",
  },
  {
    id: "vanguard",
    tier: 3,
    name: "Focus Vanguard",
    tagline: "Steel forged in silence.",
    description:
      "Deep-work territory. Distractions are managed by design and study blocks hold their shape without willpower spikes.",
    min: 40,
    max: 55,
    image: "/badges/focus-vanguard.png",
    accent: "text-sky-300",
    glow: "rgba(125, 211, 252, 0.55)",
  },
  {
    id: "iron",
    tier: 4,
    name: "Iron Minded",
    tagline: "Fire tempered by will.",
    description:
      "Elite consistency. Heavy weekly load carried without burnout, with revision and recall running on schedule.",
    min: 55,
    max: 70,
    image: "/badges/iron-mind.png",
    accent: "text-amber-400",
    glow: "rgba(251, 191, 36, 0.6)",
  },
  {
    id: "apex",
    tier: 5,
    name: "Apex Mastery",
    tagline: "The summit of discipline.",
    description:
      "The summit of discipline. Sustained maximum focus, mastery-level recall, and a routine that no longer negotiates with mood.",
    min: 70,
    max: Infinity,
    image: "/badges/apex-mastery.png",
    accent: "text-violet-300",
    glow: "rgba(196, 181, 253, 0.7)",
  },
];

/** True when the user has not yet met the Tier 1 entry requirement. */
export function isUnranked(hours: number): boolean {
  return Math.max(0, hours || 0) < UNRANKED_MIN_HOURS;
}

/**
 * The earned tier for the given weekly focus hours, or `null` when the user is
 * UNRANKED (below the Tier 1 entry threshold).
 */
export function evaluateWeeklyTier(hours: number): WeeklyTier | null {
  const h = Math.max(0, hours || 0);
  if (h < UNRANKED_MIN_HOURS) return null;
  return (
    WEEKLY_TIERS.find((t) => h >= t.min && h < t.max) ??
    WEEKLY_TIERS[WEEKLY_TIERS.length - 1]
  );
}

/**
 * Progress target for the rank banner. Unranked users are pushed toward the
 * Tier 1 entry requirement; ranked users toward their next tier (or their own
 * ceiling once at the summit).
 */
export function rankProgress(hours: number): {
  hours: number;
  target: number;
  targetName: string;
  percent: number;
  unranked: boolean;
} {
  const h = Math.max(0, hours || 0);
  const tier = evaluateWeeklyTier(h);
  if (!tier) {
    return {
      hours: h,
      target: UNRANKED_MIN_HOURS,
      targetName: WEEKLY_TIERS[0].name,
      percent: Math.min(100, (h / UNRANKED_MIN_HOURS) * 100),
      unranked: true,
    };
  }
  const idx = WEEKLY_TIERS.findIndex((t) => t.id === tier.id);
  const next = WEEKLY_TIERS[idx + 1] ?? null;
  const target = next ? next.min : tier.min;
  return {
    hours: h,
    target,
    targetName: next ? next.name : tier.name,
    percent: next ? Math.min(100, (h / target) * 100) : 100,
    unranked: false,
  };
}


// --- Focus data (mirrors _app.discipline.focus.tsx storage) ---
const FOCUS_KEY = "ftlb.focus.daily.v2";
const FOCUS_STATE_KEY = "ftlb.focus.state.v1";
export type FocusDaily = Record<string, number>; // YYYY-MM-DD -> seconds

/** Raw persisted daily focus seconds (flushed by the Focus Analytics Tracker). */
export function loadFocusDailyRaw(): FocusDaily {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(FOCUS_KEY);
    return raw ? (JSON.parse(raw) as FocusDaily) : {};
  } catch {
    return {};
  }
}

/**
 * Seconds of the CURRENT running focus session that have not yet been flushed
 * into the daily map. Lets the report reflect live minutes instantly.
 */
export function liveUncountedFocusSeconds(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(FOCUS_STATE_KEY);
    if (!raw) return 0;
    const s = JSON.parse(raw) as {
      running?: boolean;
      accumulatedMs?: number;
      startedAt?: number | null;
      lastCountedSeconds?: number;
    };
    const total = Math.floor(
      ((s.accumulatedMs ?? 0) +
        (s.running && s.startedAt ? Date.now() - s.startedAt : 0)) /
        1000,
    );
    return Math.max(0, total - (s.lastCountedSeconds ?? 0));
  } catch {
    return 0;
  }
}

/**
 * Daily focus seconds including the live, in-flight session. Every report
 * surface reads through this so 5 logged minutes shows up as 0.1 hrs at once.
 */
export function loadFocusDaily(): FocusDaily {
  const map = { ...loadFocusDailyRaw() };
  const live = liveUncountedFocusSeconds();
  if (live > 0) {
    const key = dateKey(new Date());
    map[key] = (map[key] ?? 0) + live;
  }
  return map;
}


export function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Sunday..Saturday week containing `ref`. */
export function weekRange(ref: Date = new Date()): { start: Date; end: Date } {
  const start = new Date(ref);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end };
}

export function monthRange(ref: Date = new Date()): { start: Date; end: Date } {
  const start = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 1);
  return { start, end };
}

function sumHoursBetween(daily: FocusDaily, start: Date, end: Date): number {
  let secs = 0;
  const cur = new Date(start);
  while (cur < end) {
    secs += daily[dateKey(cur)] ?? 0;
    cur.setDate(cur.getDate() + 1);
  }
  return secs / 3600;
}

export function weeklyFocusHours(ref: Date = new Date()): number {
  const { start, end } = weekRange(ref);
  return sumHoursBetween(loadFocusDaily(), start, end);
}

export function monthlyFocusHours(ref: Date = new Date()): number {
  const { start, end } = monthRange(ref);
  return sumHoursBetween(loadFocusDaily(), start, end);
}

export type MonthlyWeekBadge = {
  label: string;
  hours: number;
  tier: WeeklyTier | null;
  hasData: boolean;
};

/** Return the 4 weeks of the given month, each with its awarded tier. */
export function monthlyWeeklyBadges(ref: Date = new Date()): MonthlyWeekBadge[] {
  const daily = loadFocusDaily();
  const first = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const nextMonth = new Date(ref.getFullYear(), ref.getMonth() + 1, 1);
  const weeks: MonthlyWeekBadge[] = [];

  // Build 4 fixed weekly slots aligned to weeks of the month.
  for (let i = 0; i < 4; i++) {
    const wStart = new Date(first);
    wStart.setDate(1 + i * 7);
    const wEnd = new Date(wStart);
    wEnd.setDate(wStart.getDate() + 7);
    if (wEnd > nextMonth) wEnd.setTime(nextMonth.getTime());
    const hours = sumHoursBetween(daily, wStart, wEnd);
    weeks.push({
      label: `Week ${i + 1}`,
      hours,
      tier: evaluateWeeklyTier(hours),
      hasData: hours > 0,
    });
  }
  return weeks;
}

/** Estimate weekly hours for a squad member from their daily focus minutes. */
export function memberWeeklyHours(dailyFocusMinutes: number): number {
  return (dailyFocusMinutes / 60) * 7;
}

// --- Reminder banner triggers ---
const REMINDER_KEY = "ftlb.perfReport.reminded.v1";

type ReminderState = { week?: string; month?: string };

function loadReminderState(): ReminderState {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(REMINDER_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function saveReminderState(s: ReminderState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(REMINDER_KEY, JSON.stringify(s));
}

/** Returns which report card (if any) to prompt the user about right now. */
export function pendingReportPrompt(): "week" | "month" | null {
  if (typeof window === "undefined") return null;
  const now = new Date();
  const state = loadReminderState();
  // Monthly: on the 1st, remind about last month
  if (now.getDate() === 1) {
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const key = `${lastMonth.getFullYear()}-${lastMonth.getMonth() + 1}`;
    if (state.month !== key) return "month";
  }
  // Weekly: on Sunday, remind about the week just closed
  if (now.getDay() === 0) {
    const { start } = weekRange(now);
    const prevStart = new Date(start);
    prevStart.setDate(prevStart.getDate() - 7);
    const key = dateKey(prevStart);
    if (state.week !== key) return "week";
  }
  return null;
}

export function ackReportPrompt(kind: "week" | "month") {
  const now = new Date();
  const state = loadReminderState();
  if (kind === "week") {
    const { start } = weekRange(now);
    const prevStart = new Date(start);
    prevStart.setDate(prevStart.getDate() - 7);
    state.week = dateKey(prevStart);
  } else {
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    state.month = `${lastMonth.getFullYear()}-${lastMonth.getMonth() + 1}`;
  }
  saveReminderState(state);
}
