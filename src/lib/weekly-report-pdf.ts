/**
 * Standalone weekly/monthly report PDF export.
 *
 * jsPDF is imported lazily inside the function so nothing PDF-related is
 * evaluated on page load — it only runs on an explicit download trigger.
 */
import {
  dateKey,
  evaluateWeeklyTier,
  loadFocusDaily,
  monthRange,
  weekRange,
} from "@/lib/weekly-badge";
import { buildLedgerRows, readHabitsLite, readStudentNameLite } from "@/lib/report-data";
import { formatRevisionTotal, revisionLogEntries } from "@/lib/revision-logs";

const CLAIM_KEY = "ftlb.report.claimed.v1";

type ClaimState = { week?: string; month?: string };

function loadClaims(): ClaimState {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(CLAIM_KEY) ?? "{}") as ClaimState;
  } catch {
    return {};
  }
}

function currentWeekKey(): string {
  return dateKey(weekRange().start);
}

function currentMonthKey(): string {
  const n = new Date();
  return `${n.getFullYear()}-${n.getMonth() + 1}`;
}

export function isReportClaimed(kind: "week" | "month"): boolean {
  const claims = loadClaims();
  return kind === "week"
    ? claims.week === currentWeekKey()
    : claims.month === currentMonthKey();
}

export function markReportClaimed(kind: "week" | "month") {
  if (typeof window === "undefined") return;
  const claims = loadClaims();
  if (kind === "week") claims.week = currentWeekKey();
  else claims.month = currentMonthKey();
  try {
    window.localStorage.setItem(CLAIM_KEY, JSON.stringify(claims));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent("ftlb:report-claimed", { detail: kind }));
}

function focusHours(range: { start: Date; end: Date }): number {
  const daily = loadFocusDaily();
  let secs = 0;
  const cur = new Date(range.start);
  while (cur < range.end) {
    secs += daily[dateKey(cur)] ?? 0;
    cur.setDate(cur.getDate() + 1);
  }
  return secs / 3600;
}

/** Builds and downloads the report PDF immediately. */
export async function downloadReportPdf(kind: "week" | "month" = "week") {
  const { jsPDF } = await import("jspdf");

  const range = kind === "week" ? weekRange() : monthRange();
  const hours = focusHours(range);
  const tier = evaluateWeeklyTier(hours);
  const retention = Math.min(98, 55 + Math.round(hours * 1.2));
  const habitScore = Math.min(100, 40 + Math.round(hours * 2));
  const hoursSaved = Math.round(hours * 0.35 * 10) / 10;
  const rows = buildLedgerRows(new Date(range.start), range, retention);
  const habits = readHabitsLite();
  const revisionLog = revisionLogEntries(range);
  const label = kind === "week" ? "Weekly" : "Monthly";

  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();

  pdf.setFillColor(10, 13, 20);
  pdf.rect(0, 0, W, H, "F");

  pdf.setTextColor(212, 175, 55);
  pdf.setFontSize(10);
  pdf.text("FROM THE LAST BENCH", 48, 60);
  pdf.setFontSize(24);
  pdf.setTextColor(245, 245, 245);
  pdf.text(`${label} Performance Report`, 48, 92);

  pdf.setFontSize(11);
  pdf.setTextColor(156, 163, 175);
  pdf.text(
    `${readStudentNameLite()} · ${range.start.toDateString()} — ${new Date(
      range.end.getTime() - 1,
    ).toDateString()}`,
    48,
    114,
  );

  let y = 156;
  const stat = (k: string, v: string) => {
    pdf.setFontSize(10);
    pdf.setTextColor(156, 163, 175);
    pdf.text(k.toUpperCase(), 48, y);
    pdf.setFontSize(16);
    pdf.setTextColor(94, 234, 212);
    pdf.text(v, 260, y);
    y += 28;
  };
  stat("Rank", tier?.name ?? "Unranked");
  stat("Focus hours", `${hours.toFixed(1)} h`);
  stat("Retention", `${retention}%`);
  stat("Habit consistency", `${habitScore}%`);
  stat("Hours saved", `${hoursSaved} h`);

  y += 14;
  pdf.setFontSize(12);
  pdf.setTextColor(212, 175, 55);
  pdf.text("FIELD LEDGER", 48, y);
  y += 20;
  pdf.setFontSize(10);
  pdf.setTextColor(245, 245, 245);
  pdf.text("Date", 48, y);
  pdf.text("Wake", 190, y);
  pdf.text("Hours", 290, y);
  pdf.text("Tasks", 390, y);
  y += 6;
  pdf.setDrawColor(60, 60, 70);
  pdf.line(48, y, W - 48, y);
  y += 16;

  pdf.setTextColor(200, 205, 215);
  rows.forEach((r) => {
    if (y > H - 120) return;
    pdf.text(`${r.weekday ?? ""} ${r.dateLabel ?? ""}`.trim(), 48, y);
    pdf.text(String(r.wake ?? "—"), 190, y);
    pdf.text(`${(Number(r.hours) || 0).toFixed(1)}`, 290, y);
    pdf.text(r.tasksTotal ? `${r.tasksDone ?? 0}/${r.tasksTotal}` : "—", 390, y);
    y += 16;
  });

  if (revisionLog.length && y < H - 140) {
    y += 18;
    pdf.setFontSize(9);
    pdf.setTextColor(120, 126, 138);
    pdf.text("-".repeat(64), 48, y);
    y += 14;
    pdf.setFontSize(12);
    pdf.setTextColor(212, 175, 55);
    pdf.text(`${label.toUpperCase()} CHAPTER REVISION LOG`, 48, y);
    y += 8;
    pdf.setFontSize(9);
    pdf.setTextColor(120, 126, 138);
    pdf.text("-".repeat(64), 48, y);
    y += 18;
    pdf.setFontSize(10);
    pdf.setTextColor(200, 205, 215);
    revisionLog.slice(0, 12).forEach((r) => {
      if (y > H - 90) return;
      const mins = Math.max(0, Number(r.minutes) || 0);
      pdf.text(
        `\u2022 ${r.chapter ?? "Chapter"} \u2014 ${mins} Mins Revision (${r.date})`,
        48,
        y,
      );
      y += 15;
    });
    y += 8;
    pdf.setFontSize(11);
    pdf.setTextColor(94, 234, 212);
    pdf.text(
      `Total Chapter Revision Time: ${formatRevisionTotal(
        revisionLog.reduce((s, r) => s + (Number(r.minutes) || 0), 0),
      )}`,
      48,
      y,
    );
    y += 6;
  }


  if (habits.length && y < H - 120) {
    y += 18;
    pdf.setFontSize(12);
    pdf.setTextColor(212, 175, 55);
    pdf.text("HABITS", 48, y);
    y += 18;
    pdf.setFontSize(10);
    pdf.setTextColor(200, 205, 215);
    habits.slice(0, 8).forEach((h) => {
      if (y > H - 60) return;
      pdf.text(`${h.name ?? "Habit"} — ${Math.max(0, Number(h.streak) || 0)} day streak`, 48, y);
      y += 15;
    });
  }

  pdf.setFontSize(9);
  pdf.setTextColor(120, 126, 138);
  pdf.text("Average Skilled, Phenomenally Willed.", 48, H - 40);

  pdf.save(`${kind === "week" ? "weekly" : "monthly"}-performance-report.pdf`);
}
