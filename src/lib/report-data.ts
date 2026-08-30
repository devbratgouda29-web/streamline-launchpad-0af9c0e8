// Shared readers for the Grand Performance Report (live mobile UI + PDF canvas).
import { dateKey, loadFocusDaily } from "@/lib/weekly-badge";

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
  const missionByDate = new Map<string, MissionDayLite>();
  readMissionDays()
    .filter((d) => {
      const t = new Date(d.date + "T00:00:00").getTime();
      return t >= range.start.getTime() && t < range.end.getTime();
    })
    .forEach((d) => missionByDate.set(d.date, d));

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(anchor);
    d.setDate(d.getDate() + i);
    const key = dateKey(d);
    const secs = focusDaily[key] ?? 0;
    const md = missionByDate.get(key);
    const isToday = key === dateKey(new Date());
    const hours = secs / 3600;
    const ghostsTotal = secs > 0 ? Math.max(1, Math.round(hours * 0.6)) : 0;
    return {
      key,
      weekday: d.toLocaleDateString(undefined, { weekday: "short" }),
      dateLabel: d.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
      hours,
      tasksDone: md?.tasks?.filter((t) => t.done).length ?? 0,
      tasksTotal: md?.tasks?.length ?? 0,
      ghostsTotal,
      ghostsCleared: Math.round(ghostsTotal * (retention / 100)),
      wake: secs > 0 || isToday ? wake : "—",
      isToday,
    };
  });
}

