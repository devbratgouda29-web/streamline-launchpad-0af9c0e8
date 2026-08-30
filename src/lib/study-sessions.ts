// StudySession schema + aggregation helpers.
// Sessions are stored per-user in localStorage; aggregators bucket them into
// weekly totals per subject for the stacked bar chart on the Report Card PDF.

export type StudySubject = "Physics" | "Chemistry" | "Math/Bio" | "Other";

export type StudySession = {
  id: string;
  userId: string;
  subject: StudySubject;
  topic: string;
  durationMinutes: number;
  timestamp: number; // ms
};

const SESSIONS_KEY = "ftlb.studySessions.v1";

export function loadStudySessions(): StudySession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SESSIONS_KEY);
    return raw ? (JSON.parse(raw) as StudySession[]) : [];
  } catch {
    return [];
  }
}

export function saveStudySessions(list: StudySession[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SESSIONS_KEY, JSON.stringify(list));
}

export function addStudySession(s: Omit<StudySession, "id">) {
  const list = loadStudySessions();
  list.push({ ...s, id: `${s.timestamp}-${Math.random().toString(36).slice(2, 8)}` });
  saveStudySessions(list);
}

export const SUBJECT_COLORS: Record<StudySubject, string> = {
  Physics: "#38BDF8",
  Chemistry: "#F472B6",
  "Math/Bio": "#FBBF24",
  Other: "#94A3B8",
};

const SUBJECT_ORDER: StudySubject[] = ["Physics", "Chemistry", "Math/Bio", "Other"];

export type WeekBucket = {
  label: string;
  start: Date;
  end: Date;
  bySubject: Record<StudySubject, number>; // hours
  total: number;
};

/** Return 4 weekly buckets of the calendar month `ref` sits in. */
export function monthlyStudyByWeekSubject(ref: Date = new Date()): WeekBucket[] {
  const sessions = loadStudySessions();
  const first = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const nextMonth = new Date(ref.getFullYear(), ref.getMonth() + 1, 1);
  const weeks: WeekBucket[] = [];
  for (let i = 0; i < 4; i++) {
    const start = new Date(first);
    start.setDate(1 + i * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    if (end > nextMonth) end.setTime(nextMonth.getTime());
    const bySubject = Object.fromEntries(
      SUBJECT_ORDER.map((s) => [s, 0]),
    ) as Record<StudySubject, number>;
    let total = 0;
    sessions.forEach((s) => {
      if (s.timestamp >= start.getTime() && s.timestamp < end.getTime()) {
        const h = s.durationMinutes / 60;
        bySubject[s.subject] = (bySubject[s.subject] ?? 0) + h;
        total += h;
      }
    });
    weeks.push({ label: `Week ${i + 1}`, start, end, bySubject, total });
  }
  return weeks;
}

/** Sum hours over a range, or across full weeks. */
export function totalHours(sessions: StudySession[], start: Date, end: Date) {
  return sessions
    .filter((s) => s.timestamp >= start.getTime() && s.timestamp < end.getTime())
    .reduce((a, s) => a + s.durationMinutes / 60, 0);
}

export { SUBJECT_ORDER };
