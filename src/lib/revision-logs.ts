// Revision session log — one record per completed recall session.
//
// Total time is `Base Time + Overtime Extensions − Early Finish Delta`, which
// the recall session already resolves via `spentMsOf()`.
//
// Records are written to localStorage first (works offline / signed out) and
// mirrored to the `revision_logs` table for signed-in students.

import { supabase } from "@/integrations/supabase/client";

export type RevisionLog = {
  id: string;
  itemId: string;
  /** Chapter name, e.g. "Kinematics". */
  chapterName: string;
  /** Subject label, e.g. "Physics · 12". */
  subject: string;
  /** ISO date (YYYY-MM-DD) of the session. */
  date: string;
  totalMinutesSpent: number;
  baseMinutes: number;
  overtimeMinutes: number;
  completedAt: number;
};

const KEY = "ftlb.revisionLogs.v1";

function isoDate(ts: number): string {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function loadRevisionLogs(): RevisionLog[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as RevisionLog[]) : [];
    return Array.isArray(parsed) ? parsed.filter((l) => !!l?.chapterName) : [];
  } catch {
    return [];
  }
}

function saveRevisionLogs(list: RevisionLog[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(-400)));
  } catch {
    /* ignore */
  }
}

/**
 * Records a finished revision session. Returns the stored record.
 * The remote insert is best-effort and never blocks the reward flow.
 */
export function recordRevisionSession(input: {
  itemId: string;
  chapterName: string;
  subject?: string;
  totalMs: number;
  baseMs?: number;
  overtimeMs?: number;
}): RevisionLog {
  const completedAt = Date.now();
  const totalMinutesSpent = Math.max(1, Math.round((input.totalMs ?? 0) / 60000));
  const entry: RevisionLog = {
    id: `${completedAt}-${Math.random().toString(36).slice(2, 8)}`,
    itemId: input.itemId,
    chapterName: input.chapterName || "Untitled Chapter",
    subject: input.subject ?? "",
    date: isoDate(completedAt),
    totalMinutesSpent,
    baseMinutes: Math.round((input.baseMs ?? 0) / 60000),
    overtimeMinutes: Math.round((input.overtimeMs ?? 0) / 60000),
    completedAt,
  };

  const list = loadRevisionLogs();
  list.push(entry);
  saveRevisionLogs(list);

  void (async () => {
    try {
      const { data } = await supabase.auth.getUser();
      const userId = data?.user?.id;
      if (!userId) return;
      await supabase.from("revision_logs").insert({
        user_id: userId,
        item_id: entry.itemId,
        chapter_name: entry.chapterName,
        subject: entry.subject,
        total_minutes_spent: entry.totalMinutesSpent,
        base_minutes: entry.baseMinutes,
        overtime_minutes: entry.overtimeMinutes,
        completed_at: new Date(entry.completedAt).toISOString(),
      });
    } catch {
      /* offline / signed out — local copy is authoritative */
    }
  })();

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("ftlb:revision-logged", { detail: entry }));
  }
  return entry;
}

/** Logs inside [start, end), newest first. */
export function revisionLogsInRange(range: { start: Date; end: Date }): RevisionLog[] {
  const from = range.start.getTime();
  const to = range.end.getTime();
  return loadRevisionLogs()
    .filter((l) => l.completedAt >= from && l.completedAt < to)
    .sort((a, b) => b.completedAt - a.completedAt);
}

/**
 * One line per chapter for the report: minutes are summed when the same
 * chapter was revised more than once in the period.
 */
export function revisionLogSummary(range: { start: Date; end: Date }): {
  chapterName: string;
  subject: string;
  totalMinutesSpent: number;
  sessions: number;
}[] {
  const byChapter = new Map<
    string,
    { chapterName: string; subject: string; totalMinutesSpent: number; sessions: number }
  >();
  for (const log of revisionLogsInRange(range)) {
    const key = log.chapterName.trim().toLowerCase();
    const cur = byChapter.get(key);
    if (cur) {
      cur.totalMinutesSpent += log.totalMinutesSpent;
      cur.sessions += 1;
    } else {
      byChapter.set(key, {
        chapterName: log.chapterName,
        subject: log.subject,
        totalMinutesSpent: log.totalMinutesSpent,
        sessions: 1,
      });
    }
  }
  return Array.from(byChapter.values()).sort(
    (a, b) => b.totalMinutesSpent - a.totalMinutesSpent,
  );
}

/** Weekday label, e.g. "Monday". */
function weekdayLabel(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { weekday: "long" });
}

export type RevisionLogEntry = {
  chapter: string;
  subject: string;
  minutes: number;
  date: string;
  sessions: number;
};

/**
 * Chapter-level revision log for the PDF report. Falls back to sample rows
 * when nothing has been logged yet so the exported report still previews the
 * section layout.
 */
export function revisionLogEntries(range: { start: Date; end: Date }): RevisionLogEntry[] {
  const byKey = new Map<string, RevisionLogEntry>();
  for (const log of revisionLogsInRange(range)) {
    const day = weekdayLabel(log.completedAt);
    const key = `${log.chapterName.trim().toLowerCase()}|${day}`;
    const cur = byKey.get(key);
    if (cur) {
      cur.minutes += log.totalMinutesSpent;
      cur.sessions += 1;
    } else {
      byKey.set(key, {
        chapter: log.chapterName,
        subject: log.subject,
        minutes: log.totalMinutesSpent,
        date: day,
        sessions: 1,
      });
    }
  }
  const rows = Array.from(byKey.values()).sort((a, b) => b.minutes - a.minutes);
  if (rows.length) return rows;
  return [
    { chapter: "Kinematics", subject: "", minutes: 35, date: "Monday", sessions: 1 },
    { chapter: "Animal Kingdom", subject: "", minutes: 43, date: "Monday", sessions: 1 },
    { chapter: "The Living World", subject: "", minutes: 25, date: "Wednesday", sessions: 1 },
  ];
}

/** "2 Hours 15 Mins" style total for the report summary badge. */
export function formatRevisionTotal(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  return `${Math.floor(m / 60)} Hours ${m % 60} Mins`;
}
