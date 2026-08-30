// Shared recall session state.
// Coordinates the tier-based recall timer between the Recall screen
// (/recall/:itemId) and the PDF Reader (/reader/:noteId).
//
// Timer duration is derived from the chapter's active tier and re-loop count:
//   Loop 0 →  T1: 30m · T2: 25m · T3: 20m · T4: 15m · T5: 10m
//   Loop 1+ (all tiers) → 10m
//
// If the user leaves the reader (visibility hidden, minimize, navigate away)
// and does NOT return within 10 minutes, the timer resets to its initial
// duration on next resume.

export type Tier = 1 | 2 | 3 | 4 | 5;

const BADGES: Record<Tier, string> = {
  1: "BRONZE CORE",
  2: "IRON CORE",
  3: "STEEL SENTINEL",
  4: "TITANIUM CORE",
  5: "PLATINUM CORE",
};

export function badgeName(tier: Tier, loopCount = 0): string {
  const base = BADGES[tier];
  return loopCount > 0 ? `${base} x${loopCount + 1}` : base;
}

export function durationMsFor(tier: Tier, loopCount = 0): number {
  if (loopCount > 0) return 10 * 60 * 1000;
  const mins: Record<Tier, number> = { 1: 30, 2: 25, 3: 20, 4: 15, 5: 10 };
  return (mins[tier] ?? 10) * 60 * 1000;
}

export const ABSENCE_RESET_MS = 10 * 60 * 1000;

export type RecallSession = {
  itemId: string;
  sourceId: string;
  tier: Tier;
  loopCount: number;
  /** Base duration + every +10 min extension granted so far. */
  durationMs: number;
  remainingMs: number;
  playing: boolean;
  isDebt: boolean;
  completed: boolean;
  lastActiveAt: number;
  /** Original tier duration, before any overtime extension. */
  baseDurationMs?: number;
  /** Total overtime granted via "Add 10 Mins More". */
  overtimeMs?: number;
  /** Actual time spent, frozen at the moment the session finished. */
  spentMs?: number;
};

/** Extension granted per "Add 10 Mins More" tap. */
export const EXTENSION_MS = 10 * 60 * 1000;

/** Time actually spent so far: (base + overtime) − remaining. */
export function spentMsOf(s: RecallSession | null | undefined): number {
  if (!s) return 0;
  if (typeof s.spentMs === "number") return Math.max(0, s.spentMs);
  return Math.max(0, (s.durationMs ?? 0) - (s.remainingMs ?? 0));
}


const KEY = "ftlb.recall.session.v2";

type Listener = (s: RecallSession | null) => void;
const listeners = new Set<Listener>();

function read(): RecallSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RecallSession;
    if (!parsed || typeof parsed.remainingMs !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function write(s: RecallSession | null) {
  if (typeof window === "undefined") return;
  try {
    if (s) window.localStorage.setItem(KEY, JSON.stringify(s));
    else window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  for (const l of listeners) l(s);
}

export function getSession(): RecallSession | null {
  return read();
}

/**
 * True when a recall session for this item has been started, completed or
 * bypassed. Used to clear overdue/fracture penalties from badge UI.
 */
export function hasActiveSessionFor(itemId: string): boolean {
  const s = read();
  if (!s || s.itemId !== itemId) return false;
  return s.completed || s.playing || s.remainingMs < s.durationMs;
}

/** Drop any stored session belonging to this item (stale tier cleanup). */
export function clearSessionForItem(itemId: string) {
  const s = read();
  if (s && s.itemId === itemId) write(null);
}

export function ensureSession(input: {
  itemId: string;
  sourceId: string;
  isDebt: boolean;
  tier: Tier;
  loopCount: number;
}): RecallSession {
  const cur = read();
  const now = Date.now();
  // A stored session whose tier/loop no longer matches the item's current
  // state is stale (e.g. after a claim, dev reset or bypass) — rebuild it so
  // the duration always matches the active tier.
  const stale =
    !!cur &&
    cur.itemId === input.itemId &&
    (cur.tier !== input.tier || cur.loopCount !== input.loopCount);
  if (cur && cur.itemId === input.itemId && !stale) {
    // Absence guard — reset if user vanished too long.
    if (!cur.completed && now - cur.lastActiveAt > ABSENCE_RESET_MS) {
      const duration = durationMsFor(cur.tier, cur.loopCount);
      const reset: RecallSession = {
        ...cur,
        durationMs: duration,
        remainingMs: duration,
        baseDurationMs: duration,
        overtimeMs: 0,
        spentMs: undefined,
        playing: false,
        lastActiveAt: now,
      };
      write(reset);
      return reset;
    }
    return cur;
  }
  const duration = durationMsFor(input.tier, input.loopCount);
  const next: RecallSession = {
    itemId: input.itemId,
    sourceId: input.sourceId,
    tier: input.tier,
    loopCount: input.loopCount,
    durationMs: duration,
    remainingMs: duration,
    baseDurationMs: duration,
    overtimeMs: 0,
    playing: false,
    isDebt: input.isDebt,
    completed: false,
    lastActiveAt: now,
  };
  write(next);
  return next;
}

export function setPlaying(playing: boolean) {
  const cur = read();
  if (!cur) return;
  if (cur.playing === playing) return;
  write({ ...cur, playing, lastActiveAt: Date.now() });
}

export function setRemaining(remainingMs: number) {
  const cur = read();
  if (!cur) return;
  const clamped = Math.max(0, Math.min(cur.durationMs, remainingMs));
  write({
    ...cur,
    remainingMs: clamped,
    completed: cur.completed || clamped <= 0,
    playing: clamped <= 0 ? false : cur.playing,
  });
}

export function markCompleted() {
  const cur = read();
  if (!cur) return;
  write({
    ...cur,
    remainingMs: 0,
    playing: false,
    completed: true,
    spentMs: spentMsOf({ ...cur, remainingMs: 0 }),
    lastActiveAt: Date.now(),
  });
}

/**
 * "⏱️ Add 10 Mins More" — grants overtime, un-completes the session and
 * resumes ticking. Repeatable each time the timer expires again.
 */
export function extendSession(extraMs: number = EXTENSION_MS): RecallSession | null {
  const cur = read();
  if (!cur) return null;
  const next: RecallSession = {
    ...cur,
    baseDurationMs: cur.baseDurationMs ?? cur.durationMs,
    overtimeMs: (cur.overtimeMs ?? 0) + extraMs,
    durationMs: cur.durationMs + extraMs,
    remainingMs: Math.max(0, cur.remainingMs) + extraMs,
    completed: false,
    playing: true,
    spentMs: undefined,
    lastActiveAt: Date.now(),
  };
  write(next);
  return next;
}

/**
 * "✨ Finish & Claim Reward" — ends an overtime session immediately and
 * freezes the actual time spent (base + overtime − remaining).
 */
export function finishEarly(): RecallSession | null {
  const cur = read();
  if (!cur) return null;
  const next: RecallSession = {
    ...cur,
    spentMs: spentMsOf(cur),
    remainingMs: 0,
    playing: false,
    completed: true,
    lastActiveAt: Date.now(),
  };
  write(next);
  return next;
}


export function heartbeat() {
  const cur = read();
  if (!cur) return;
  write({ ...cur, lastActiveAt: Date.now() });
}

export function resetToStart() {
  const cur = read();
  if (!cur) return;
  const base = cur.baseDurationMs ?? cur.durationMs;
  write({
    ...cur,
    durationMs: base,
    remainingMs: base,
    baseDurationMs: base,
    overtimeMs: 0,
    spentMs: undefined,
    completed: false,
    playing: false,
    lastActiveAt: Date.now(),
  });

}

export function clearSession() {
  write(null);
}

export function subscribe(l: Listener): () => void {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) l(read());
  };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }
  return () => {
    listeners.delete(l);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}
