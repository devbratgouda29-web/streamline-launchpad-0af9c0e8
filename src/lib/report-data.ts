// Shared readers for the Grand Performance Report (live mobile UI + PDF canvas).
import { dateKey, loadFocusDaily } from "@/lib/weekly-badge";
import { loadRevisionLogs } from "@/lib/revision-logs";
import { getGhostTasks } from "@/lib/revision-engine";

/**
 * Ghost-task counts per date key.
 * Cleared = completed recall sessions (revision logs) on that date.
 * Total = cleared + ghost tasks still outstanding (counted on today's row).
 */
export function readGhostCounts(): Record<string, { cleared: number; total: number }> {
  if (typeof window === "undefined") return {};
  const out: Record<string, { cleared: number; total: number }> = {};
  const bump = (key: string, cleared: number, total: number) => {
    const cur = out[key] ?? { cleared: 0, total: 0 };
    out[key] = { cleared: cur.cleared + cleared, total: cur.total + total };
  };

  try {
    for (const log of loadRevisionLogs()) bump(log.date, 1, 1);
  } catch {
    /* ignore */
  }

  try {
    const today = dateKey(new Date());
    const pending = getGhostTasks();
    if (pending.length) bump(today, 0, pending.length);
  } catch {
    /* ignore */
  }

  return out;
}

export type MissionDayLite = { date: string; tasks: { done: boolean }[] };
export type HabitLite = {
  name: string;
  emoji?: string;
  streak: number;
  relapses?: { ts: number; reason?: string }[];
};

export function readMissionDays(): MissionDayLite[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem("ftlb.mission.v1");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const days: MissionDayLite[] = [];
    if (parsed?.active) days.push(parsed.active);
    if (Array.isArray(parsed?.history)) days.push(...parsed.history);
    return days;
  } catch {
    return [];
  }
}

export function readHabitsLite(): HabitLite[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem("ftlb.habits.v2");
    return raw ? (JSON.parse(raw) as HabitLite[]) : [];
  } catch {
    return [];
  }
}

export function readStudentNameLite(): string {
  if (typeof window === "undefined") return "Devbrat";
  try {
    return (
      window.localStorage.getItem("ftlb.profile.name") ||
      window.localStorage.getItem("ftlb.student.name") ||
      window.localStorage.getItem("ftlb.user.username") ||
      "Devbrat"
    );
  } catch {
    return "Devbrat";
  }
}

export function readWakeTarget(): string {
  if (typeof window === "undefined") return "—";
  try {
    const raw = window.localStorage.getItem("ftlb.alarm.v1");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.time) return parsed.time as string;
    }
  } catch {
    /* ignore */
  }
  return "—";
}

export type LedgerRow = {
  key: string;
  weekday: string;
  dateLabel: string;
  hours: number;
  tasksDone: number;
  tasksTotal: number;
  ghostsCleared: number;
  ghostsTotal: number;
  wake: string;
  isToday: boolean;
};

/** Sun→Sat ledger rows for the given anchor week start. */
export function buildLedgerRows(
  anchor: Date,
  range: { start: Date; end: Date },
  retention = 100,
): LedgerRow[] {
  const focusDaily = loadFocusDaily();
  const wake = readWakeTarget();
  const ghostCounts = readGhostCounts();

  // Load actual mission diary entries directly from local storage
  const diaryRaw =
    typeof window !== "undefined"
      ? localStorage.getItem("mission_diary") ||
        localStorage.getItem("ftlb.mission.v1") ||
        "[]"
      : "[]";

  let diaryData: any[] = [];
  try {
    const parsed = JSON.parse(diaryRaw);
    diaryData = Array.isArray(parsed)
      ? parsed
      : (parsed.history || [parsed.active]).filter(Boolean);
  } catch {
    diaryData = [];
  }

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(anchor);
    d.setDate(d.getDate() + i);
    const key = dateKey(d);
    const secs = focusDaily[key] ?? 0;
    const isToday = key === dateKey(new Date());

    // Find actual day entry from mission diary
    const dayEntry = diaryData.find((item: any) => item.date === key);
    const taskList: any[] = dayEntry?.tasks || [];

    // Separate self-made tasks vs ghost tasks
    const stdTasks = taskList.filter((t) => !t.isGhostTask && !t.ghost);
    const ghostTasks = taskList.filter((t) => t.isGhostTask || t.ghost);

    const tasksDone = stdTasks.filter((t) => t.completed || t.done).length;
    const tasksTotal = stdTasks.length;

    const fromLogs = ghostCounts[key] ?? { cleared: 0, total: 0 };
    const ghostsCleared =
      ghostTasks.filter((t) => t.completed || t.done).length + fromLogs.cleared;
    const ghostsTotal = ghostTasks.length + fromLogs.total;

    return {
      key,
      weekday: d.toLocaleDateString(undefined, { weekday: "short" }),
      dateLabel: d.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
      hours: secs / 3600,
      tasksDone,
      tasksTotal,
      ghostsTotal,
      ghostsCleared,
      wake: secs > 0 || isToday ? wake : "—",
      isToday,
    };
  });
}
