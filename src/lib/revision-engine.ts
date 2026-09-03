import { clearSessionForItem } from "@/lib/recall-session";

// Automated Revision Engine — Ebbinghaus-inspired 5-tier spaced repetition.
// Persists to localStorage under `ftlb.revision.v1`. Fully client-side.

export type RevisionKind = "chapter" | "mistakes";
export type Difficulty = "hard" | "easy";

export type RevisionItem = {
  id: string;
  name: string;
  kind: RevisionKind;
  tier: 1 | 2 | 3 | 4 | 5;
  lastReviewedAt: number;
  nextDueAt: number;
  mastered: boolean; // reaches true when Level 5 achieved
  history: { at: number; tier: number; difficulty: Difficulty }[];
  sourceId?: string; // external id (e.g. library note id) for lookup
  startedAt?: number; // baseline anchor timestamp
  fractured?: boolean; // true after a missed midnight deadline
  frozenPct?: number; // progress pct locked in at fracture time
  lockedDifficulty?: Difficulty; // strict-mode lock: only allowed choice until cycle completes
  loopCount?: number; // 0 on first pass; +1 each time Level 5 is claimed
  badges?: string[]; // audit trail of badges awarded on claim
  paused?: boolean; // when true, tracking is disabled; badges preserved
  highestBadge?: string; // highest badge earned (preserved through pause)
  displayTier?: 1 | 2 | 3 | 4 | 5; // most recently CLAIMED tier badge to display
  displayLoopCount?: number; // loop count of the most recently claimed badge
};


/** Pause tracking for a chapter. Preserves tier/loop/badges for later resume. */
export function pauseItem(id: string): RevisionItem | null {
  const items = safeLoad();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  const cur = items[idx];
  const lastBadge = cur.badges?.[cur.badges.length - 1] ?? cur.highestBadge;
  const updated: RevisionItem = {
    ...cur,
    paused: true,
    highestBadge: lastBadge ?? cur.highestBadge,
  };
  const next = [...items];
  next[idx] = updated;
  safeSave(next);
  return updated;
}

/**
 * Resume tracking. Starts the next loop from Level 1 while preserving
 * loopCount and earned badges (so the shield shows e.g. "Bronze Core x3").
 */
export function resumeItem(id: string, difficulty: Difficulty = "easy"): RevisionItem | null {
  const items = safeLoad();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  const cur = items[idx];
  const now = Date.now();
  const interval = INTERVAL_MATRIX[1][difficulty];
  const updated: RevisionItem = {
    ...cur,
    paused: false,
    tier: 1,
    lastReviewedAt: now,
    nextDueAt: now + interval,
    mastered: false,
    fractured: false,
    frozenPct: undefined,
    startedAt: now,
    lockedDifficulty: difficulty,
    history: [...cur.history, { at: now, tier: 1, difficulty }].slice(-50),
  };
  const next = [...items];
  next[idx] = updated;
  safeSave(next);
  clearSessionForItem(id);
  return updated;
}

/**
 * Debt Recall repair: clears the fracture on the CURRENT tier without
 * advancing. Resets the schedule so the user can complete the current
 * tier cleanly before moving up.
 */
export function repairFractured(id: string): RevisionItem | null {
  const items = safeLoad();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  const cur = items[idx];
  const now = Date.now();
  const difficulty = cur.lockedDifficulty ?? "easy";
  const interval = INTERVAL_MATRIX[cur.tier][difficulty];
  const updated: RevisionItem = {
    ...cur,
    fractured: false,
    frozenPct: undefined,
    lastReviewedAt: now,
    nextDueAt: now + interval,
    startedAt: now,
    history: [...cur.history, { at: now, tier: cur.tier, difficulty }].slice(-50),
  };
  const next = [...items];
  next[idx] = updated;
  safeSave(next);
  clearSessionForItem(id);
  return updated;
}

/** True until the user completes their first Level 5 pass. */
export function canSwitchDifficulty(item: RevisionItem): boolean {
  return (item.loopCount ?? 0) >= 1;
}

/** Set the locked difficulty for a re-loop cycle and reset the tier-1 timer. */
export function setDifficulty(id: string, difficulty: Difficulty): RevisionItem | null {
  const items = safeLoad();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  const cur = items[idx];
  const now = Date.now();
  const interval = INTERVAL_MATRIX[cur.tier][difficulty];
  const updated: RevisionItem = {
    ...cur,
    lockedDifficulty: difficulty,
    lastReviewedAt: now,
    startedAt: now,
    nextDueAt: now + interval,
  };
  const next = [...items];
  next[idx] = updated;
  safeSave(next);
  return updated;
}

/**
 * Advance a chapter to its next level after the user claims their reward.
 * Returns badge + resulting tier/loop for the celebration UI.
 * Level 1→2→3→4→5. Claiming at Level 5 completes the cycle and restarts at
 * Level 1 with loopCount++.
 */
export function advanceOnClaim(
  id: string,
): { badge: string; tier: RevisionItem["tier"]; loopCount: number } | null {
  const items = safeLoad();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  const cur = items[idx];
  const now = Date.now();
  const loopCount = cur.loopCount ?? 0;
  const badge = badgeLabel(cur.tier, loopCount);
  let newTier: RevisionItem["tier"] = cur.tier;
  let newLoop = loopCount;
  if (cur.tier === 5) {
    newTier = 1;
    newLoop = loopCount + 1;
  } else {
    newTier = (cur.tier + 1) as RevisionItem["tier"];
  }
  const difficulty = cur.lockedDifficulty ?? "easy";
  const interval = INTERVAL_MATRIX[newTier][difficulty];
  const updated: RevisionItem = {
    ...cur,
    tier: newTier,
    loopCount: newLoop,
    lastReviewedAt: now,
    nextDueAt: now + interval,
    mastered: false,
    fractured: false,
    frozenPct: undefined,
    startedAt: now,
    history: [...cur.history, { at: now, tier: newTier, difficulty }].slice(-50),
    badges: [...(cur.badges ?? []), badge],
    highestBadge: badge,
    displayTier: cur.tier,
    displayLoopCount: loopCount,
  };

  const next = [...items];
  next[idx] = updated;
  safeSave(next);
  // A new tier means the previous recall session (and its ghost task) is
  // stale — drop it so only one correctly-timed task can exist.
  clearSessionForItem(id);
  return { badge, tier: newTier, loopCount: newLoop };
}

function badgeLabel(tier: RevisionItem["tier"], loopCount: number): string {
  const map: Record<RevisionItem["tier"], string> = {
    1: "BRONZE CORE",
    2: "IRON CORE",
    3: "STEEL SENTINEL",
    4: "TITANIUM CORE",
    5: "PLATINUM CORE",
  };
  const base = map[tier];
  return loopCount > 0 ? `${base} x${loopCount + 1}` : base;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// Level -> {hard, easy} interval in ms. Level 1 is the starting tier.
export const INTERVAL_MATRIX: Record<
  1 | 2 | 3 | 4 | 5,
  { hard: number; easy: number }
> = {
  1: { hard: 12 * HOUR, easy: 24 * HOUR },
  2: { hard: 2 * DAY, easy: 3 * DAY },
  3: { hard: 4 * DAY, easy: 7 * DAY },
  4: { hard: 7 * DAY, easy: 15 * DAY },
  5: { hard: 15 * DAY, easy: 30 * DAY },
};

const STORAGE_KEY = "ftlb.revision.v1";

type Listener = (items: RevisionItem[]) => void;
const listeners = new Set<Listener>();

function safeLoad(): RevisionItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeSave(items: RevisionItem[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l(items));
}

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

export function getAllItems(): RevisionItem[] {
  return safeLoad();
}

export function getItem(id: string): RevisionItem | null {
  return safeLoad().find((i) => i.id === id) ?? null;
}

export function getItemBySource(sourceId: string): RevisionItem | null {
  return safeLoad().find((i) => i.sourceId === sourceId) ?? null;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Register a chapter / notes item for tracking. Starts at Level 1 due now. */
export function addItem(
  name: string,
  kind: RevisionKind = "chapter",
  opts: { difficulty?: Difficulty; sourceId?: string } = {},
): RevisionItem {
  const items = safeLoad();
  const now = Date.now();
  const difficulty: Difficulty = opts.difficulty ?? "easy";
  const item: RevisionItem = {
    id: newId(),
    name,
    kind,
    tier: 1,
    lastReviewedAt: now,
    nextDueAt: now + INTERVAL_MATRIX[1][difficulty],
    mastered: false,
    history: [],
    sourceId: opts.sourceId,
    startedAt: now,
    lockedDifficulty: difficulty,
  };
  safeSave([...items, item]);
  return item;
}

/**
 * Demo/admin helper: force the displayed tier badge on a chapter.
 * Pass `tier: null` to revoke the badge entirely.
 */
export function setDisplayTier(
  id: string,
  tier: 1 | 2 | 3 | 4 | 5 | null,
  loopCount = 0,
): RevisionItem | null {
  const items = safeLoad();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  const updated: RevisionItem = { ...items[idx] };
  if (tier == null) {
    delete updated.displayTier;
    delete updated.displayLoopCount;
  } else {
    updated.displayTier = tier;
    updated.displayLoopCount = loopCount;
  }
  const next = [...items];
  next[idx] = updated;
  safeSave(next);
  return updated;
}

export function removeItem(id: string) {
  safeSave(safeLoad().filter((i) => i.id !== id));
}

/** Reset a mastered item back to Level 1 to re-loop the revision cycle. */
export function resetItem(id: string, difficulty: Difficulty = "easy"): RevisionItem | null {
  const items = safeLoad();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  const now = Date.now();
  const updated: RevisionItem = {
    ...items[idx],
    tier: 1,
    lastReviewedAt: now,
    nextDueAt: now + INTERVAL_MATRIX[1][difficulty],
    mastered: false,
    startedAt: now,
    history: [...items[idx].history, { at: now, tier: 1, difficulty }].slice(-50),
    lockedDifficulty: difficulty,
  };
  const next = [...items];
  next[idx] = updated;
  safeSave(next);
  clearSessionForItem(id);
  return updated;
}

/**
 * Record a review outcome. `hard` keeps the item at the current tier's hard
 * interval; `easy` promotes to the next level (up to Level 5 = Mastered).
 */
export function reviewItem(id: string, difficulty: Difficulty): RevisionItem | null {
  const items = safeLoad();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  const cur = items[idx];
  const now = Date.now();
  const nextTier =
    difficulty === "easy"
      ? (Math.min(5, cur.tier + 1) as RevisionItem["tier"])
      : cur.tier;
  const interval = INTERVAL_MATRIX[nextTier][difficulty];
  const updated: RevisionItem = {
    ...cur,
    tier: nextTier,
    lastReviewedAt: now,
    nextDueAt: now + interval,
    mastered: nextTier === 5,
    history: [...cur.history, { at: now, tier: nextTier, difficulty }].slice(-50),
    fractured: false,
    frozenPct: undefined,
    startedAt: now,
  };
  const next = [...items];
  next[idx] = updated;
  safeSave(next);
  return updated;
}

/** Items whose nextDueAt is in the past — surfaced as Ghost Tasks. */
export function getOverdueItems(now: number = Date.now()): RevisionItem[] {
  return safeLoad().filter((i) => !i.mastered && !i.paused && i.nextDueAt <= now);
}

/* ------------------------- Grace period helpers -------------------------- */

/** Grace window: 12 hours from the exact moment a revision unlocks. */
export const GRACE_WINDOW_MS = 12 * HOUR;

/** 11:59:59 PM of the calendar day containing `ts`, offset by `dayOffset` days. */
function endOfDay(ts: number, dayOffset = 0): number {
  const d = new Date(ts);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/**
 * Deadline after which a revision may break the streak/badge.
 * Exactly 12 hours from unlock — never tied to the midnight calendar reset.
 */
export function graceDeadline(item: RevisionItem): number {
  return item.nextDueAt + GRACE_WINDOW_MS;
}

/** Human label for the remaining grace window, e.g. "Expires in 11h". */
export function graceRemainingLabel(item: RevisionItem, now: number = Date.now()): string {
  const ms = graceDeadline(item) - now;
  if (ms <= 0) return "Expired";
  const hours = Math.floor(ms / HOUR);
  if (hours >= 1) return `Expires in ${hours}h`;
  return `Expires in ${Math.max(1, Math.round(ms / (60 * 1000)))}m`;
}

/** Tasks that unlock after 8:00 PM are surfaced as "Due Tomorrow". */
export function isDueTomorrow(item: RevisionItem, now: number = Date.now()): boolean {
  const unlockedAt = item.nextDueAt;
  if (unlockedAt > now) return false;
  const unlockHour = new Date(unlockedAt).getHours();
  const sameDay = endOfDay(unlockedAt) === endOfDay(now);
  return unlockHour >= 20 && sameDay;
}


export type GhostTask = {
  id: string;
  itemId: string;
  title: string;
  href: string;
  overdueMs: number;
  dueTomorrow: boolean;
  graceDeadline: number;
  graceLabel: string;
  /** Session length implied by the item's current tier, in minutes. */
  durationMin: number;
};

/** Minutes for a tier/loop — mirrors recall-session.durationMsFor. */
function tierDurationMin(tier: RevisionItem["tier"], loopCount = 0): number {
  if (loopCount > 0) return 10;
  const mins: Record<RevisionItem["tier"], number> = { 1: 30, 2: 25, 3: 20, 4: 15, 5: 10 };
  return mins[tier] ?? 10;
}

export function getGhostTasks(now: number = Date.now()): GhostTask[] {
  // Exactly ONE ghost task per note: dedupe by source note (falling back to
  // the item name), always keeping the most recently due entry.
  const byNote = new Map<string, RevisionItem>();
  for (const i of getOverdueItems(now)) {
    const key = i.sourceId ?? i.name;
    const prev = byNote.get(key);
    if (!prev || i.nextDueAt > prev.nextDueAt) byNote.set(key, i);
  }
  return [...byNote.values()].map((i) => ({
    id: `ghost-${i.id}`,
    itemId: i.id,
    title: `Obligatory Recall: ${i.name}`,
    href: `/recall/${i.id}`,
    overdueMs: now - i.nextDueAt,
    dueTomorrow: isDueTomorrow(i, now),
    graceDeadline: graceDeadline(i),
    graceLabel: graceRemainingLabel(i, now),
    durationMin: tierDurationMin(i.tier, i.loopCount ?? 0),
  }));
}



/** Compute 0..100 progress from startedAt baseline to nextDueAt. */
export function progressPct(item: RevisionItem, now: number = Date.now()): number {
  if (item.fractured && typeof item.frozenPct === "number") return item.frozenPct;
  const base = item.startedAt ?? item.lastReviewedAt;
  const total = Math.max(1, item.nextDueAt - base);
  const elapsed = Math.max(0, now - base);
  return Math.min(100, (elapsed / total) * 100);
}

/**
 * Fracture any non-mastered item that stayed uncompleted past its full grace
 * window (12h from unlock). Streaks/badges are never broken by the midnight
 * calendar reset.
 * Returns names of items freshly fractured on this call.

 */
export function checkAndApplyFractures(now: number = Date.now()): string[] {
  const items = safeLoad();
  const freshlyFractured: string[] = [];
  let changed = false;
  const next = items.map((i) => {
    if (i.fractured || i.mastered || i.paused) return i;
    if (now > graceDeadline(i)) {
      changed = true;
      freshlyFractured.push(i.name);
      return {
        ...i,
        fractured: true,
        frozenPct: progressPct(i, now),
      };
    }
    return i;
  });
  if (changed) safeSave(next);
  return freshlyFractured;
}

/**
 * Badge-break check. A badge only breaks once a revision's full 12-hour grace
 * window has expired — never at the midnight calendar reset.

 */
export function checkStreakStatus(now: number = Date.now()): {
  broken: string[];
  atRisk: RevisionItem[];
  safe: boolean;
} {
  const broken = checkAndApplyFractures(now);
  const atRisk = getOverdueItems(now).filter((i) => !i.fractured);
  return { broken, atRisk, safe: broken.length === 0 };
}


export function getFracturedItems(): RevisionItem[] {
  return safeLoad().filter((i) => i.fractured);
}

export function isLockdownActive(): boolean {
  return getFracturedItems().length > 0;
}

/** Restore a fractured item — resets to Level 1 and clears the fracture. */
export function restoreItem(id: string, difficulty: Difficulty = "easy"): RevisionItem | null {
  const items = safeLoad();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  const now = Date.now();
  const updated: RevisionItem = {
    ...items[idx],
    tier: 1,
    lastReviewedAt: now,
    nextDueAt: now + INTERVAL_MATRIX[1][difficulty],
    mastered: false,
    fractured: false,
    frozenPct: undefined,
    startedAt: now,
    history: [...items[idx].history, { at: now, tier: 1, difficulty }].slice(-50),
  };
  const next = [...items];
  next[idx] = updated;
  safeSave(next);
  clearSessionForItem(id);
  return updated;
}

/**
 * Dev bypass: force every tracked item's timer to zero (progress = 100%),
 * clear fractures, and drop lockdown flags. Used by the DevPass button.
 */
export function bypassAllTimers() {
  const items = safeLoad();
  const now = Date.now();
  const next = items.map((i) => ({
    ...i,
    startedAt: now - 1,
    lastReviewedAt: now,
    nextDueAt: now,
    fractured: false,
    frozenPct: 100,
  }));
  safeSave(next);
  for (const i of next) clearSessionForItem(i.id);
}

/** Dev / demo helper to seed a couple of items due immediately. */
export function seedDemoOverdue() {
  const now = Date.now();
  const items = safeLoad();
  if (items.length > 0) return;
  const demo: RevisionItem[] = [
    {
      id: newId(),
      name: "Cell Biology · Ch 8",
      kind: "chapter",
      tier: 1,
      lastReviewedAt: now - 2 * DAY,
      nextDueAt: now - HOUR,
      mastered: false,
      history: [],
    },
  ];
  safeSave([...items, ...demo]);
}