/**
 * Lightweight notification feed derived from the app's local stores.
 * Client-only: every read is guarded so SSR never touches localStorage.
 */
import { getFracturedItems, getOverdueItems } from "@/lib/revision-engine";
import { readHabitsLite } from "@/lib/report-data";
import { isReportClaimed } from "@/lib/weekly-report-pdf";
import { pendingReportPrompt } from "@/lib/weekly-badge";


export type AppNotification = {
  id: string;
  kind: "recall" | "fracture" | "report" | "habit";
  title: string;
  body: string;
  ts: number;
};

const CLEARED_KEY = "ftlb.notifications.cleared.v1";

function loadCleared(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CLEARED_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function clearAllNotifications() {
  if (typeof window === "undefined") return;
  const ids = buildNotifications(true).map((n) => n.id);
  try {
    window.localStorage.setItem(CLEARED_KEY, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent("ftlb:notifications"));
}

/* ---------------------- Nighttime deferral (10PM–6AM) --------------------- */

/** True between 10:00 PM and 6:00 AM local time. */
export function isQuietHours(now: number = Date.now()): boolean {
  const h = new Date(now).getHours();
  return h >= 22 || h < 6;
}

/** Next 7:30 AM after `now` — when deferred reminders are re-surfaced. */
export function nextMorningSlot(now: number = Date.now()): number {
  const d = new Date(now);
  const h = d.getHours();
  if (h >= 22) d.setDate(d.getDate() + 1);
  d.setHours(7, 30, 0, 0);
  return d.getTime();
}

const DEFERRED_KEY = "ftlb.notifications.deferred.v1";

function loadDeferred(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(DEFERRED_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function saveDeferred(map: Record<string, number>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DEFERRED_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

/**
 * Records the deferral for a revision reminder raised in quiet hours and
 * reports whether it should currently be shown. Reminders scheduled during
 * 10PM–6AM stay hidden until 7:30 AM the following morning.
 */
export function shouldSurfaceReminder(id: string, now: number = Date.now()): boolean {
  const map = loadDeferred();
  const scheduled = map[id];
  if (scheduled != null) {
    if (now < scheduled) return false;
    delete map[id];
    saveDeferred(map);
    return true;
  }
  if (isQuietHours(now)) {
    map[id] = nextMorningSlot(now);
    saveDeferred(map);
    return false;
  }
  return true;
}

export function buildNotifications(includeCleared = false): AppNotification[] {
  if (typeof window === "undefined") return [];
  const list: AppNotification[] = [];
  const now = Date.now();

  try {
    getOverdueItems().forEach((item) => {
      const id = `recall:${item.id}`;
      if (!shouldSurfaceReminder(id, now)) return;
      list.push({
        id,
        kind: "recall",
        title: "Recall overdue",
        body: `${item.name} is past its revision window. Run a recall to keep the streak.`,
        ts: now,
      });
    });
  } catch {
    /* ignore */
  }

  try {
    getFracturedItems().forEach((item) => {
      const id = `fracture:${item.id}`;
      if (!shouldSurfaceReminder(id, now)) return;
      list.push({
        id,
        kind: "fracture",
        title: "Shield fractured",
        body: `${item.name} shattered. Complete a Restoration Recall to lift the lockdown.`,
        ts: now,
      });
    });
  } catch {
    /* ignore */
  }


  try {
    const pending = pendingReportPrompt();
    if (pending && !isReportClaimed(pending)) {
      list.push({
        id: `report:available:${pending}`,
        kind: "report",
        title: `${pending === "week" ? "Weekly" : "Monthly"} performance report available`,
        body: "Tap to open the Grand Performance Report and export your PDF.",
        ts: now,
      });
    }
    if (isReportClaimed("week")) {
      list.push({
        id: "report:week",
        kind: "report",
        title: "Weekly report claimed",
        body: "Your weekly performance card has been downloaded.",
        ts: now,
      });
    }
  } catch {
    /* ignore */
  }


  try {
    readHabitsLite()
      .filter((h) => (Number(h.streak) || 0) > 0)
      .slice(0, 3)
      .forEach((h) => {
        list.push({
          id: `habit:${h.name}`,
          kind: "habit",
          title: "Habit update",
          body: `${h.name} — ${Math.max(0, Number(h.streak) || 0)} day streak running.`,
          ts: now,
        });
      });
  } catch {
    /* ignore */
  }

  if (includeCleared) return list;
  const cleared = new Set(loadCleared());
  return list.filter((n) => !cleared.has(n.id));
}
