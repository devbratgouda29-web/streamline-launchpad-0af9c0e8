import { createFileRoute, Link } from "@tanstack/react-router";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { forwardRef, useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import {
  ArrowLeft,
  Download,
  Flame,
  Sparkles,
  Trophy,
  Play,
  X,
  BarChart3,
  Calendar,
  Lock,
} from "lucide-react";
import {
  WEEKLY_TIERS,
  evaluateWeeklyTier,
  loadFocusDaily,
  weekRange,
  monthRange,
  weeklyFocusHours,
  monthlyFocusHours,
  monthlyWeeklyBadges,
  dateKey,
  UNRANKED_MIN_HOURS,
  type WeeklyTier,
  type MonthlyWeekBadge,
} from "@/lib/weekly-badge";

import { WeeklyBadge } from "@/components/WeeklyBadge";
import { ackReportPrompt } from "@/lib/weekly-badge";
import { markReportClaimed } from "@/lib/weekly-report-pdf";
import { exportSectionsToPdf } from "@/lib/dom-pdf";
// Chart-heavy dashboard (recharts) — split out of the route entry chunk.
const PerformanceDashboard = lazy(() => import("@/components/PerformanceDashboard").then((m) => ({ default: m.PerformanceDashboard })));
import { buildLedgerRows, readHabitsLite } from "@/lib/report-data";

import { getAllItems, type RevisionItem } from "@/lib/revision-engine";
import { formatRevisionTotal, revisionLogEntries } from "@/lib/revision-logs";

import {
  monthlyStudyByWeekSubject,
} from "@/lib/study-sessions";

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="h-10 w-40 animate-pulse rounded-lg bg-secondary" />
      <div className="h-44 animate-pulse rounded-3xl bg-secondary" />
      <div className="h-12 animate-pulse rounded-2xl bg-secondary" />
      <div className="h-64 animate-pulse rounded-2xl bg-secondary" />
    </div>
  );
}


const CHAPTER_TIER_META: Record<RevisionItem["tier"], { label: string; color: string }> = {
  1: { label: "Bronze Core", color: "#CD7F32" },
  2: { label: "Iron Core", color: "#B0B4BC" },
  3: { label: "Steel Sentinel", color: "#7DD3FC" },
  4: { label: "Titanium Core", color: "#E2E8F0" },
  5: { label: "Platinum Core", color: "#F5F3FF" },
};


export const Route = createFileRoute("/_app/performance")({
  head: () => ({
    meta: [
      { title: "Performance Reports — From The Last Bench" },
      {
        name: "description",
        content:
          "Weekly and monthly performance report cards with focus heatmaps, recall mastery metrics, and unlocked rank badges.",
      },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    view: (s.view === "monthly" ? "monthly" : "weekly") as "weekly" | "monthly",
    wrapped: s.wrapped === "1" || s.wrapped === true ? true : false,
  }),
  component: () => (
    <ErrorBoundary>
      <PerformancePage />
    </ErrorBoundary>
  ),

});

type Metrics = {
  hours: number;
  retention: number; // %
  hoursSaved: number;
  habitScore: number; // %
  badgesRestored: number;
  tier: WeeklyTier | null;
};

function computeMetrics(range: { start: Date; end: Date }): Metrics {
  const daily = loadFocusDaily();
  let secs = 0;
  const cur = new Date(range.start);
  while (cur < range.end) {
    secs += daily[dateKey(cur)] ?? 0;
    cur.setDate(cur.getDate() + 1);
  }
  const hours = secs / 3600;
  // Placeholder recall/habit derivations; ready to swap for real stores.
  const retention = Math.min(98, 55 + Math.round(hours * 1.2));
  const hoursSaved = Math.round(hours * 0.35 * 10) / 10;
  const habitScore = Math.min(100, 40 + Math.round(hours * 2));
  return {
    hours,
    retention,
    hoursSaved,
    habitScore,
    badgesRestored: Math.floor(hours / 6),
    tier: evaluateWeeklyTier(hours),
  };
}

function PerformancePage() {
  const { view, wrapped: wrappedParam } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [wrapped, setWrapped] = useState(wrappedParam);
  // Hydration-safe: localStorage is read AFTER mount so the server HTML and
  // the first client render always match.
  const [devBypass, setDevBypass] = useState(false);
  useEffect(() => {
    try {
      setDevBypass(!!localStorage.getItem("ftlb.devpass.bypass"));
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    setWrapped(wrappedParam);
  }, [wrappedParam]);
  useEffect(() => {
    const on = () => setDevBypass(true);
    window.addEventListener("devpass:bypass", on);
    return () => window.removeEventListener("devpass:bypass", on);
  }, []);

  // --- Live data engine: re-read every store on focus/storage/interval ------
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener("focus", bump);
    window.addEventListener("storage", bump);
    document.addEventListener("visibilitychange", bump);
    const id = window.setInterval(bump, 3000);
    bump(); // hydrate client-only stores after mount
    return () => {
      window.removeEventListener("focus", bump);
      window.removeEventListener("storage", bump);
      document.removeEventListener("visibilitychange", bump);
      window.clearInterval(id);
    };
  }, []);

  // Pitch-black chrome: no white/grey gutters around the report canvas.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prev = [html.style.background, body.style.background] as const;
    html.style.background = "#000000";
    body.style.background = "#000000";
    return () => {
      html.style.background = prev[0];
      body.style.background = prev[1];
    };
  }, []);

  // Warm the browser cache with every tier crest as soon as the page mounts so
  // html2canvas never captures a half-loaded <img> (the Level 2/3 blanks).
  useEffect(() => {
    WEEKLY_TIERS.forEach((t) => {
      const img = new Image();
      img.src = t.image;
      void img.decode?.().catch(() => {});
    });
  }, []);


  const range = useMemo(
    () => (view === "weekly" ? weekRange() : monthRange()),
    [view],
  );
  const metrics = useMemo(() => computeMetrics(range), [range, tick]);
  const monthlyBadges = useMemo(() => monthlyWeeklyBadges(), [tick]);

  const printRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  // The printable A4 canvas is only mounted while an export is running, so
  // html2canvas/jsPDF never touch the DOM on initial render.
  const [printMounted, setPrintMounted] = useState(false);
  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    setPrintMounted(true);
    try {
      // Let React paint the off-screen canvas before snapshotting it.
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      const root = printRef.current;
      if (!root) throw new Error("Report canvas unavailable");
      const sections = Array.from(
        root.querySelectorAll<HTMLElement>("[data-report-section]"),
      );
      if (!sections.length) throw new Error("No report sections to export");
      await exportSectionsToPdf(sections, "grand-performance-report.pdf");
      markReportClaimed(view === "monthly" ? "month" : "week");
      ackReportPrompt(view === "monthly" ? "month" : "week");
    } catch (err) {
      console.error("PDF export failed", err);
    } finally {
      setPrintMounted(false);
      setExporting(false);
    }
  };






  const closeOverlay = () => {
    setWrapped(false);
    navigate({ search: { view, wrapped: false }, replace: true }).catch(() => {});
  };

  const basePdfUnlock = useMemo(() => computePdfUnlock(view), [view]);
  const pdfUnlock: PdfUnlock = devBypass
    ? { unlocked: true, label: "Download Report Card (PDF) — Dev Unlocked" }
    : basePdfUnlock;

  const anchor =
    view === "weekly"
      ? new Date(range.start)
      : (() => {
          const d = new Date();
          d.setDate(d.getDate() - 6);
          return d;
        })();
  const ledger = useMemo(() => buildLedgerRows(anchor, range, metrics.retention), [range, tick]);
  const habits = useMemo(() => readHabitsLite(), [tick]);

  return (
    <div
      className="flex flex-col gap-5 px-4 pt-5 pb-24"
      style={{ background: "#000000", minHeight: "100vh" }}
    >
      <Link
        to="/discipline"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground"
        aria-label="Back to Discipline hub"
      >
        <ArrowLeft className="h-4 w-4" />
      </Link>

      <Suspense fallback={<DashboardSkeleton />}>
      <PerformanceDashboard
        metrics={metrics}
        ledger={ledger}
        habits={habits}
        view={view}
        onExport={handleExport}
        exporting={exporting}
        exportLabel={pdfUnlock.label}
        canExport={pdfUnlock.unlocked}
      />
      </Suspense>




      <button
        type="button"
        onClick={() => {
          const next = !devBypass;
          setDevBypass(next);
          try {
            if (next) localStorage.setItem("ftlb.devpass.bypass", String(Date.now()));
            else localStorage.removeItem("ftlb.devpass.bypass");
          } catch {}
        }}
        className={
          "flex items-center justify-between rounded-xl border px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] " +
          (devBypass
            ? "border-amber-400/60 bg-amber-400/15 text-amber-200"
            : "border-border bg-card text-muted-foreground")
        }
      >
        <span>Dev PDF Unlock (Preview)</span>
        <span
          className={
            "ml-3 inline-flex h-5 w-9 items-center rounded-full px-0.5 transition-colors " +
            (devBypass ? "bg-amber-400/70" : "bg-muted")
          }
        >
          <span
            className={
              "h-4 w-4 rounded-full bg-white transition-transform " +
              (devBypass ? "translate-x-4" : "translate-x-0")
            }
          />
        </span>
      </button>

      {wrapped && (
        <WrappedOverlay
          metrics={metrics}
          view={view}
          monthlyBadges={view === "monthly" ? monthlyBadges : null}
          onClose={closeOverlay}
        />
      )}

      {/* OFF-SCREEN A4 PDF RENDER CANVAS — only mounted during an export. */}
      <div
        id="pdf-export-canvas"
        aria-hidden
        style={
          printMounted
            ? {
                position: "fixed",
                top: 0,
                left: -9999,
                width: 794,
                background: "#000000",
                pointerEvents: "none",
                zIndex: -1,
              }
            : { display: "none" }
        }
      >
        {printMounted && (
          // Isolated: if the printable canvas throws while rendering, the
          // boundary swallows it instead of blanking the whole dashboard.
          <ErrorBoundary fallback={() => null}>
            <PrintableReportCard
              ref={printRef}
              key={`${view}`}
              view={view}
              metrics={metrics}
              monthlyBadges={view === "monthly" ? monthlyBadges : null}
            />
          </ErrorBoundary>
        )}
      </div>

    </div>
  );
}





type PdfUnlock = { unlocked: boolean; label: string };

function computePdfUnlock(view: "weekly" | "monthly"): PdfUnlock {
  const now = new Date();
  if (view === "weekly") {
    // Sunday after 23:59
    const unlocked =
      now.getDay() === 0 &&
      (now.getHours() > 23 || (now.getHours() === 23 && now.getMinutes() >= 59));
    return {
      unlocked,
      label: unlocked ? "Download Report Card (PDF)" : "Available at week's end",
    };
  }
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const unlocked = now.getDate() === lastDay;
  return {
    unlocked,
    label: unlocked ? "Download Report Card (PDF)" : "Available at month's end",
  };
}

function WrappedOverlay({
  metrics,
  view,
  monthlyBadges,
  onClose,
}: {
  metrics: Metrics;
  view: "weekly" | "monthly";
  monthlyBadges:
    | MonthlyWeekBadge[]
    | null;
  onClose: () => void;
}) {
  const slides = useMemo(() => {
    const s: {
      bg: string;
      title: string;
      value: string;
      caption?: string;
      badge?: WeeklyTier | null;
      trophies?: typeof monthlyBadges;
    }[] = [
      {
        bg: "from-fuchsia-600 via-purple-700 to-indigo-900",
        title: "Your Focus",
        value: `${metrics.hours.toFixed(1)}h`,
        caption: view === "weekly" ? "logged this week" : "logged this month",
      },
      {
        bg: "from-sky-600 via-blue-700 to-slate-900",
        title: "Recall Retention",
        value: `${metrics.retention}%`,
        caption: `≈ ${metrics.hoursSaved}h of re-study saved`,
      },
      {
        bg: "from-amber-500 via-orange-600 to-rose-800",
        title: "Habit Consistency",
        value: `${metrics.habitScore}%`,
        caption: "streaks & rituals held",
      },
    ];
    if (monthlyBadges) {
      s.push({
        bg: "from-yellow-500 via-amber-600 to-neutral-900",
        title: "Trophy Case",
        value: "Weeks Won",
        trophies: monthlyBadges,
      });
    }
    s.push({
      bg: "from-violet-700 via-fuchsia-800 to-black",
      title: "Rank Unlocked",
      value: metrics.tier ? metrics.tier.name : "Unranked",
      caption: metrics.tier
        ? metrics.tier.tagline
        : `${UNRANKED_MIN_HOURS.toFixed(1)} weekly focus hours unlock Level 1.`,
      badge: metrics.tier,
    });
    return s;
  }, [metrics, view, monthlyBadges]);

  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (idx >= slides.length - 1) return;
    const t = setTimeout(() => setIdx((i) => i + 1), 3500);
    return () => clearTimeout(t);
  }, [idx, slides.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const slide = slides[idx];
  return (
    <div
      className="fixed inset-0 z-[90] grid place-items-center bg-black/80 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={
          "relative flex h-[min(80vh,640px)] w-full max-w-sm flex-col items-center justify-center gap-4 overflow-hidden rounded-3xl bg-gradient-to-br p-6 text-center text-white " +
          slide.bg
        }
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-white/20 text-white hover:bg-white/30"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex flex-col items-center gap-3">
          <Sparkles className="h-5 w-5 text-white/80" />
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/70">
            {slide.title}
          </p>
          {slide.badge ? (
            <WeeklyBadge tier={slide.badge} size="xl" />
          ) : slide.trophies ? (
            <div className="grid grid-cols-4 gap-3">
              {slide.trophies.map((t) => (
                <WeeklyBadge
                  key={t.label}
                  tier={t.tier}
                  size="md"
                  locked={!t.hasData}
                />
              ))}
            </div>
          ) : (
            <Flame className="h-10 w-10 text-white/80" />
          )}
          <p
            key={idx}
            className="animate-in fade-in zoom-in text-4xl font-black tracking-tight"
          >
            {slide.value}
          </p>
          {slide.caption && (
            <p className="text-sm text-white/80">{slide.caption}</p>
          )}
        </div>

        <div className="absolute bottom-4 flex w-full items-center justify-center gap-1 px-6">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              className={
                "h-1 flex-1 rounded-full " +
                (i <= idx ? "bg-white" : "bg-white/25")
              }
              aria-label={`slide ${i + 1}`}
            />
          ))}
        </div>

        {idx === slides.length - 1 && (
          <div className="absolute bottom-10 flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-white/60 px-4 py-2 text-[11px] font-bold text-white"
            >
              Close
            </button>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2 text-[10px] text-white/70">
        <span>Level ladder:</span>
        {WEEKLY_TIERS.map((t) => (
          <span key={t.id} className={metrics.tier?.id === t.id ? "font-bold text-white" : ""}>
            T{t.tier}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Printable A4 report card — dark obsidian executive academic transcript.
// Rendered inside #printable-report and revealed only via @media print.
// ---------------------------------------------------------------------------

type PrintableProps = {
  view: "weekly" | "monthly";
  metrics: Metrics;
  monthlyBadges:
    | MonthlyWeekBadge[]
    | null;
};

const OBSIDIAN = "#0F1117";
const PANEL = "#161A22";
const PANEL_2 = "#1C2230";
const GOLD = "#D4AF37";
const GOLD_SOFT = "rgba(212, 175, 55, 0.35)";
const NEON = "#5EEAD4";
const TEXT = "#F5F5F5";
const MUTED = "#9CA3AF";

type MissionDayLite = { date: string; tasks: { done: boolean }[] };
type HabitLite = { name: string; emoji?: string; streak: number; relapses?: { ts: number; reason?: string }[] };

function readMissionDays(): MissionDayLite[] {
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

function readHabits(): HabitLite[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem("ftlb.habits.v2");
    return raw ? (JSON.parse(raw) as HabitLite[]) : [];
  } catch {
    return [];
  }
}

function readStudentName(): string {
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


// Level grouping for the Armory Wall — full 5-tier progression.
const PDF_THRESHOLDS = [30, 40, 50, 60, 70];
const PDF_BAR_COLOR = "#5EEAD4";

// Level grouping helper types
const TIER_GROUPS: {
  key: "t1" | "t2" | "t3" | "t4" | "t5";
  label: string;
  tiers: RevisionItem["tier"][];
  color: string;
  glow: string;
}[] = [
  { key: "t1", label: "Level I · Bronze", tiers: [1], color: "#A9683C", glow: "rgba(169,104,60,0.65)" },
  { key: "t2", label: "Level II · Iron", tiers: [2], color: "#EF4444", glow: "rgba(239,68,68,0.65)" },
  { key: "t3", label: "Level III · Steel", tiers: [3], color: "#A855F7", glow: "rgba(168,85,247,0.65)" },
  { key: "t4", label: "Level IV · Titanium", tiers: [4], color: "#3B82F6", glow: "rgba(59,130,246,0.65)" },
  { key: "t5", label: "Level V · Platinum", tiers: [5], color: "#F5C542", glow: "rgba(245,197,66,0.7)" },
];



function TierColumnShield({ tier, glow }: { tier: 1 | 2 | 3 | 4 | 5; glow: string }) {
  // Uses the exact same high-res core artwork as the live Armory Wall UI.
  return (
    <img
      src={`/cores/tier-${tier}.png`}
      alt={`Level ${tier} core`}
      style={{
        display: "block",
        width: "100%",
        maxWidth: 100,
        height: "auto",
        objectFit: "contain",
        filter: `drop-shadow(0 0 12px ${glow})`,
      }}
      draggable={false}
    />
  );
}


const PrintableReportCard = forwardRef<HTMLDivElement, PrintableProps>(
  function PrintableReportCard({ view, metrics, monthlyBadges }, ref) {
    const student = readStudentName();
    const range = view === "weekly" ? weekRange() : monthRange();
    const rangeLabel = (() => {
      const end = new Date(range.end);
      end.setDate(end.getDate() - 1);
      const fmt = (d: Date) =>
        d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
      return `${fmt(range.start)} to ${fmt(end)}`;
    })();

    const missionDays = readMissionDays().filter((d) => {
      const t = new Date(d.date + "T00:00:00").getTime();
      return t >= range.start.getTime() && t < range.end.getTime();
    });

    // --- Styles -------------------------------------------------------------
    const page: React.CSSProperties = {
      width: "100%",
      padding: "clamp(14px, 4vw, 30px)",
      background: "#000000",
      color: TEXT,
      fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
      boxSizing: "border-box",
      WebkitPrintColorAdjust: "exact",
      printColorAdjust: "exact",
      position: "relative",
      overflow: "hidden",
      // Explicit page boundaries so each section becomes its own PDF page and
      // the exporter never merges or truncates the rank-ladder page.
      breakAfter: "page",
      pageBreakAfter: "always",
      breakInside: "avoid",
      minHeight: 1123,
    };


    const comicPanel: React.CSSProperties = {
      background: PANEL,
      border: `2px solid ${GOLD_SOFT}`,
      borderRadius: 10,
      position: "relative",
      boxShadow: `inset 0 0 0 1px rgba(212,175,55,0.08)`,
    };
    const tag: React.CSSProperties = {
      position: "absolute",
      top: -10,
      left: 14,
      padding: "3px 10px",
      background: OBSIDIAN,
      border: `2px solid ${GOLD}`,
      color: GOLD,
      fontSize: 9,
      fontWeight: 800,
      letterSpacing: "0.22em",
      textTransform: "uppercase",
      clipPath: "polygon(6% 0, 100% 0, 94% 100%, 0 100%)",
    };

    // Distressed vintage frame overlay (Snapseed-style) drawn on Page 1.
    const grungeFrame: React.CSSProperties = {
      position: "absolute",
      inset: 0,
      pointerEvents: "none",
      zIndex: 5,
      background:
        "radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 72%, rgba(0,0,0,0.32) 92%, rgba(0,0,0,0.6) 100%)," +
        "linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 7%, rgba(0,0,0,0) 93%, rgba(0,0,0,0.45) 100%)," +
        "linear-gradient(90deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 6%, rgba(0,0,0,0) 94%, rgba(0,0,0,0.5) 100%)",
    };
    const grungeBorder: React.CSSProperties = {
      position: "absolute",
      inset: 14,
      pointerEvents: "none",
      zIndex: 6,
      border: "1px solid rgba(212,175,55,0.18)",
      boxShadow:
        "inset 0 0 40px rgba(0,0,0,0.5), inset 0 0 4px rgba(212,175,55,0.25)",
      borderRadius: 4,

    };

    // --- 7-Day Field Ledger rows -------------------------------------------
    const focusDaily = loadFocusDaily();
    const missionByDate = new Map<string, MissionDayLite>();
    missionDays.forEach((d) => missionByDate.set(d.date, d));
    let wakeTarget = "—";
    try {
      const raw = window.localStorage.getItem("ftlb.alarm.v1");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.time) wakeTarget = parsed.time;
      }
    } catch { /* ignore */ }

    const anchor =
      view === "weekly"
        ? new Date(range.start)
        : (() => { const d = new Date(); d.setDate(d.getDate() - 6); return d; })();
    const ledgerRows = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(anchor);
      d.setDate(d.getDate() + i);
      const key = dateKey(d);
      const secs = focusDaily[key] ?? 0;
      const md = missionByDate.get(key);
      const tasksTotal = md?.tasks?.length ?? 0;
      const tasksDone = md?.tasks?.filter((t) => t.done).length ?? 0;
      const isToday = key === dateKey(new Date());
      const ghostTotal = secs > 0 ? Math.max(1, Math.round((secs / 3600) * 0.6)) : 0;
      const ghostCleared = Math.round(ghostTotal * (metrics.retention / 100));
      return {
        key,
        label: d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }),
        wake: secs > 0 || isToday ? wakeTarget : "—",
        hours: `${(secs / 3600).toFixed(1)} hrs`,
        tasks: tasksTotal ? `${tasksDone} / ${tasksTotal}` : "—",
        ghosts: ghostTotal ? `${ghostCleared} / ${ghostTotal}` : "—",
      };
    });

    // --- Armory Wall grouping ----------------------------------------------
    // Same source of truth as the live dashboard: only chapters that have
    // CLAIMED a badge appear, and the multiplier is the completed loop count.
    const chapters = getAllItems().filter(
      (c) => !c.paused && c.displayTier != null,
    );
    const grouped = TIER_GROUPS.map((g) => {
      const items = chapters.filter((c) =>
        g.tiers.includes(c.displayTier as RevisionItem["tier"]),
      );
      const counts = new Map<string, number>();
      items.forEach((c) => {
        const loops = Math.max(1, (c.displayLoopCount ?? 0) + 1);
        counts.set(c.name, Math.max(counts.get(c.name) ?? 0, loops));
      });
      return {
        ...g,
        entries: Array.from(counts.entries()).map(([name, count]) => ({ name, count })),
      };
    });

    // Trophy case always renders on page 1, regardless of weekly/monthly view.
    const trophies = monthlyBadges ?? monthlyWeeklyBadges();


    const th: React.CSSProperties = {
      fontSize: 9,
      letterSpacing: "0.18em",
      textTransform: "uppercase",
      color: GOLD,
      padding: "10px 12px",
      textAlign: "left",
      borderBottom: `1px solid ${GOLD_SOFT}`,
      background: PANEL_2,
    };
    const td: React.CSSProperties = {
      fontSize: 13,
      color: NEON,
      fontWeight: 700,
      padding: "8px 12px",
      borderBottom: `1px dashed rgba(212,175,55,0.15)`,
    };

    // --- Page 2 data: habits + weekly stacked bars -------------------------
    const habits = readHabits();
    const weekBuckets = monthlyStudyByWeekSubject();
    const chartMax = Math.max(80, ...weekBuckets.map((b) => b.total));

    // --- Chapter revision log (Section 3 footer) ---------------------------
    const revisionEntries = revisionLogEntries(range);
    const revisionTotalMinutes = revisionEntries.reduce((s, r) => s + r.minutes, 0);


    return (
      <div ref={ref} style={{ background: "#000000" }}>
        {/* ============ SECTION 1 · DISCIPLINE TRANSCRIPT ============ */}
        <div data-report-section="1" style={page}>

          <div data-grunge="frame" style={grungeFrame} />
          <div data-grunge="border" style={grungeBorder} />
          <div style={{ position: "relative", zIndex: 1 }}>
            {/* HEADER */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: 16,
              }}
            >
              <div>
                <p
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: "0.28em",
                    textTransform: "uppercase",
                    color: GOLD,
                    margin: 0,
                  }}
                >
                  From The Last Bench
                </p>
                <h1
                  style={{
                    fontSize: 30,
                    fontWeight: 300,
                    margin: "4px 0 6px",
                    color: TEXT,
                    letterSpacing: "-0.01em",
                  }}
                >
                  Official Discipline Transcript
                </h1>
                <p style={{ fontSize: 12, color: GOLD, margin: 0, letterSpacing: "0.04em" }}>
                  {view === "weekly" ? "Weekly Report" : "Monthly Report"} – {rangeLabel}
                </p>
              </div>
              <div style={{ textAlign: "right" }}>
                <p
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.28em",
                    color: MUTED,
                    margin: 0,
                  }}
                >
                  STUDENT
                </p>
                <p
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: TEXT,
                    margin: "2px 0 0",
                  }}
                >
                  {student}
                </p>
              </div>
            </div>

            {/* HERO BANNER — badge fills the yellow frame tightly */}
            <div
              style={{
                ...comicPanel,
                padding: 12,
                marginBottom: 22,
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 14,

                background: `linear-gradient(135deg, ${PANEL_2}, ${OBSIDIAN})`,
                border: `3px solid ${GOLD}`,
              }}
            >
              <div
                style={{
                  width: "clamp(150px, 32%, 300px)",
                  aspectRatio: "1 / 1",
                  flexShrink: 0,
                  padding: 2,
                  display: "grid",
                  placeItems: "center",
                  overflow: "hidden",
                }}
              >
                <img
                  src={metrics.tier?.image ?? WEEKLY_TIERS[0].image}
                  alt={metrics.tier?.name ?? "Unranked"}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                    transform: "scale(1.18)",
                    filter: metrics.tier
                      ? `drop-shadow(0 0 30px ${metrics.tier.glow})`
                      : "grayscale(1)",
                    opacity: metrics.tier ? 1 : 0.3,
                  }}
                />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <h2
                  style={{
                    fontSize: "clamp(20px, 5vw, 46px)",
                    fontWeight: 800,
                    margin: 0,
                    letterSpacing: "0.02em",
                    color: "#B9E4F5",
                    textShadow: metrics.tier ? `0 0 18px ${metrics.tier.glow}` : "none",
                    textTransform: "uppercase",
                    lineHeight: 1.05,
                    overflowWrap: "break-word",
                  }}
                >
                  {metrics.tier ? metrics.tier.name : "Unranked"}
                </h2>
                <p
                  style={{
                    fontSize: 20,
                    margin: "14px 0 0",
                    color: "#B9E4F5",
                    letterSpacing: "0.04em",
                  }}
                >
                  <span style={{ fontSize: 10, letterSpacing: "0.24em", color: MUTED, textTransform: "uppercase", marginRight: 8 }}>
                    You studied
                  </span>
                  <span style={{ fontSize: "clamp(26px, 5vw, 44px)", fontWeight: 800, color: "#B9E4F5" }}>
                    {metrics.hours.toFixed(1)}
                  </span>
                  <span style={{ fontSize: 18, marginLeft: 6, color: "#B9E4F5" }}>hours</span>
                  <span style={{ fontSize: 10, letterSpacing: "0.24em", color: MUTED, textTransform: "uppercase", marginLeft: 8 }}>
                    this {view === "weekly" ? "week" : "month"}
                  </span>
                </p>
              </div>

            </div>

            {/* 7-DAY FIELD LEDGER */}
            <div style={{ ...comicPanel, marginBottom: 22 }}>
              <span style={tag}>7-Day Field Ledger</span>
              <div style={{ padding: "22px 14px 14px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={th}>Date</th>
                      <th style={th}>Woke-Up</th>
                      <th style={th}>Study Hrs</th>
                      <th style={th}>Tasks</th>
                      <th style={th}>Ghost Tasks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerRows.map((r) => (
                      <tr key={r.key}>
                        <td style={{ ...td, color: MUTED, fontWeight: 600 }}>{r.label}</td>
                        <td style={td}>{r.wake}</td>
                        <td style={td}>{r.hours}</td>
                        <td style={td}>{r.tasks}</td>
                        <td style={td}>{r.ghosts}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* MONTHLY TROPHY CASE — enlarged weekly trophies */}
            <div style={{ ...comicPanel, padding: "30px 16px 22px" }}>
              <span style={tag}>Monthly Trophy Case</span>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                {trophies.map((w) => (
                  <div
                    key={w.label}
                    style={{
                      background: PANEL_2,
                      borderRadius: 8,
                      padding: "14px 8px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 8,
                      border: `1px solid ${GOLD_SOFT}`,
                    }}
                  >
                    <img
                      src={w.tier?.image ?? WEEKLY_TIERS[0].image}
                      alt={w.tier?.name ?? "Unranked"}
                      style={{
                        width: 144,
                        height: 144,
                        objectFit: "contain",
                        filter:
                          w.hasData && w.tier
                            ? `drop-shadow(0 0 12px ${w.tier.glow})`
                            : "grayscale(1)",
                        opacity: w.hasData && w.tier ? 1 : 0.35,
                      }}
                    />
                    <p style={{ fontSize: 10, letterSpacing: "0.18em", color: MUTED, margin: 0, textTransform: "uppercase" }}>
                      {w.label}
                    </p>
                    <p style={{ fontSize: 12, color: TEXT, margin: 0, fontWeight: 700 }}>
                      {w.hasData ? `${w.hours.toFixed(1)}h` : "—"}
                    </p>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* ============ SECTION 2 · HABIT & STACK AUDIT ============ */}
        <div data-report-section="2" style={page}>
          <div data-grunge="frame" style={grungeFrame} />
          <div data-grunge="border" style={grungeBorder} />
          <div style={{ position: "relative", zIndex: 1 }}>

            <p
              style={{
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: "0.28em",
                textTransform: "uppercase",
                color: GOLD,
                margin: "0 0 6px",
              }}
            >
              Section 2 · Habit & Stack Audit
            </p>
            <h2
              style={{
                fontSize: 26,
                fontWeight: 300,
                margin: "0 0 18px",
                color: TEXT,
                letterSpacing: "-0.01em",
              }}
            >
              Consistency & Weekly Distribution
            </h2>

            {/* HABIT TRACKER · badge grid */}
            <div style={{ ...comicPanel, padding: "26px 16px 16px", marginBottom: 22 }}>
              <span style={tag}>Habit Tracker</span>
              {habits.length === 0 ? (
                <p style={{ fontSize: 12, color: MUTED, margin: 0 }}>No habits logged.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {habits.slice(0, 8).map((h) => {
                    const t = habitTier(h.streak);
                    return (
                      <div
                        key={h.name}
                        style={{
                          display: "flex",
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 14,
                          padding: "10px 14px",
                          background: PANEL_2,
                          borderRadius: 6,
                          border: `1px solid ${GOLD_SOFT}`,
                          textAlign: "left",
                          width: "100%",
                        }}
                      >
                        <MiniShield color={t.color} size={58} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: TEXT, lineHeight: 1.2 }}>
                            {h.emoji ? `${h.emoji} ` : ""}
                            {h.name}
                          </p>
                          <p style={{ margin: "4px 0 0", fontSize: 13, fontWeight: 800, color: "#34D399" }}>
                            {h.streak} days
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* WEEKLY TOTAL-HOURS BAR GRAPH */}
            <div style={{ ...comicPanel, padding: "26px 16px 18px" }}>
              <span style={tag}>Study Hours · Weekly Totals</span>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 14, position: "relative", height: 260, padding: "10px 34px 0 8px" }}>
                {PDF_THRESHOLDS.map((t) => (
                  <div
                    key={t}
                    aria-hidden
                    style={{
                      position: "absolute",
                      left: 8,
                      right: 8,
                      bottom: `${(t / chartMax) * 240 + 20}px`,
                      borderTop: `1.5px dashed ${GOLD}`,
                      zIndex: 4,
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        right: -30,
                        top: -9,
                        fontSize: 10,
                        lineHeight: "16px",
                        letterSpacing: "0.08em",
                        color: OBSIDIAN,
                        fontWeight: 800,
                        background: GOLD,
                        padding: "0 7px",
                        borderRadius: 999,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {t}h
                    </span>
                  </div>
                ))}

                {weekBuckets.map((b) => (
                  <div key={b.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                    <div
                      style={{
                        width: "70%",
                        height: 240,
                        background: "rgba(255,255,255,0.03)",
                        border: `1px solid ${GOLD_SOFT}`,
                        borderRadius: 4,
                        display: "flex",
                        flexDirection: "column-reverse",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: "100%",
                          height: Math.max(b.total > 0 ? 4 : 0, (b.total / chartMax) * 240),
                          background: PDF_BAR_COLOR,
                          boxShadow: `0 0 14px ${PDF_BAR_COLOR}`,
                        }}
                      />
                    </div>
                    <p style={{ margin: 0, fontSize: 11, fontWeight: 800, color: "#F5F5F5" }}>
                      {b.total.toFixed(1)}h
                    </p>
                    <p style={{ margin: 0, fontSize: 10, letterSpacing: "0.16em", color: MUTED, textTransform: "uppercase" }}>
                      {b.label}
                    </p>
                  </div>
                ))}

                {/* Y-axis numeric scale intentionally removed — the gold
                    threshold pills on the right are the only scale markers,
                    which prevents overlapping/faint text collisions. */}
              </div>
            </div>

            {/* ARMORY WALL — full width, generous vertical space */}
            <div style={{ ...comicPanel, padding: "30px 18px 28px", marginTop: 22, width: "100%" }}>
              <span style={tag}>Armory Wall · Active Cores</span>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
                  gap: 10,
                  alignItems: "start",
                  width: "100%",
                  minHeight: 260,
                }}
              >
                {grouped.map((g) => (
                  <div
                    key={g.key}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 10,
                      minWidth: 0,
                    }}
                  >
                    <div>
                      <TierColumnShield
                        tier={
                          (Number(String(g.key).slice(1)) as 1 | 2 | 3 | 4 | 5) || 1
                        }
                        glow={g.glow}
                      />

                    </div>
                    <p
                      style={{
                        margin: 0,
                        fontSize: 11,
                        fontWeight: 800,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color: g.color,
                        textAlign: "center",
                      }}
                    >
                      {g.label}
                    </p>
                    <div style={{ width: "100%", textAlign: "center" }}>
                      {g.entries.length === 0 ? (
                        <p style={{ fontSize: 12, color: MUTED, margin: 0, opacity: 0.6 }}>—</p>
                      ) : (
                        g.entries.map((e) => (
                          <p
                            key={e.name}
                            style={{
                              fontSize: 13,
                              fontWeight: 700,
                              color: g.color,
                              margin: "0 0 6px",
                              lineHeight: 1.7,
                              letterSpacing: "0.01em",
                              overflowWrap: "break-word",
                              textShadow: `0 0 8px ${g.glow}`,
                            }}
                          >
                            {e.name}
                            {e.count > 1 && (
                              <span style={{ color: TEXT, fontWeight: 500, marginLeft: 6 }}>
                                x {e.count}
                              </span>
                            )}
                          </p>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* ============ SECTION 3 · FIVE-TIER MASTERY HIERARCHY (own page) ============ */}
        <div
          data-report-section="3"
          className="pdf-page-five-tier"
          style={{
            ...page,
            width: 794,
            maxWidth: "100%",
            minHeight: 1123,
            boxSizing: "border-box",
            padding: "32px 24px",
            breakBefore: "page",
            pageBreakBefore: "always",
            breakAfter: "page",
            pageBreakAfter: "always",
            breakInside: "avoid",
            pageBreakInside: "avoid",
            overflow: "visible",
            clear: "both",
            marginTop: 0,
          }}
        >
          <div data-grunge="frame" style={grungeFrame} />
          <div data-grunge="border" style={grungeBorder} />
          <div style={{ position: "relative", zIndex: 1 }}>
            <div
              style={{
                breakInside: "avoid",
                pageBreakInside: "avoid",
              }}
            >


            <p
              style={{
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: "0.28em",
                textTransform: "uppercase",
                color: GOLD,
                margin: "0 0 6px",
              }}
            >
              Rank Ladder
            </p>
            <h2
              style={{
                fontSize: 24,
                fontWeight: 300,
                margin: "0 0 12px",
                color: TEXT,
                letterSpacing: "-0.01em",
              }}
            >
              The Five-Level Mastery Hierarchy
            </h2>


            <div
              style={{
                ...comicPanel,
                padding: "22px 16px 18px",
                breakInside: "avoid",
                pageBreakInside: "avoid",
              }}
            >
              <span style={tag}>Rank Hierarchy · Weekly Focus Hours</span>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, 1fr)",
                  gap: "0.9rem",
                  width: "100%",
                  boxSizing: "border-box",
                }}
              >
                {WEEKLY_TIERS.map((t, i) => {
                  const currentIdx = metrics.tier
                    ? WEEKLY_TIERS.findIndex((x) => x.id === metrics.tier!.id)
                    : -1;
                  const unlocked = i <= currentIdx;
                  const active = i === currentIdx;
                  const last = i === WEEKLY_TIERS.length - 1;
                  return (
                    <div
                      key={t.id}
                      style={{
                        gridColumn: last && WEEKLY_TIERS.length % 2 === 1 ? "span 2" : "span 1",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        textAlign: "center",
                        gap: 6,
                        padding: "0.6rem 1rem 1.25rem",
                        breakInside: "avoid",
                        pageBreakInside: "avoid",

                        boxSizing: "border-box",
                        background: active
                          ? `linear-gradient(160deg, ${PANEL_2}, ${PANEL})`
                          : PANEL_2,
                        borderRadius: 20,
                        border: active ? `2px solid ${GOLD}` : `1px solid ${GOLD_SOFT}`,
                        boxShadow: active ? `0 0 34px -10px ${GOLD}` : "none",
                        opacity: unlocked ? 1 : 0.7,
                        position: "relative",
                      }}
                    >
                      {/* Status badge — pinned to the corner so it adds no
                          vertical space above the emblem. */}
                      <span
                        style={{
                          position: "absolute",
                          top: 8,
                          right: 10,
                          fontSize: 9,
                          fontWeight: 900,
                          letterSpacing: "0.18em",
                          textTransform: "uppercase",
                          whiteSpace: "nowrap",
                          padding: "3px 10px",
                          borderRadius: 999,
                          color: active ? OBSIDIAN : unlocked ? GOLD : MUTED,
                          background: active ? GOLD : "transparent",
                          border: active ? "none" : `1px solid ${GOLD_SOFT}`,
                        }}
                      >
                        {active ? "Active" : unlocked ? "Unlocked" : "Locked"}
                      </span>

                      {/* Large centered emblem — flush to the top of the card.
                          Same-origin asset: no crossOrigin (it would force a
                          CORS fetch the dev/CDN host doesn't answer, which is
                          what made Level 2/3 vanish in canvas captures). */}
                      <img
                        src={t.image}
                        alt={t.name}
                        width={280}
                        height={280}
                        loading="eager"
                        decoding="sync"
                        data-badge-crest
                        style={{
                          width: "100%",
                          maxWidth: 280,
                          height: "auto",
                          objectFit: "contain",
                          padding: 0,
                          margin: 0,
                          marginTop: -6,
                          display: "block",
                          filter: unlocked
                            ? `drop-shadow(0 0 16px ${t.glow})`
                            : "grayscale(1) brightness(0.55) contrast(1.1)",
                        }}
                      />


                      {/* Level · name · quote */}
                      <span
                        style={{
                          fontSize: 12,
                          letterSpacing: "0.18em",
                          color: GOLD,
                          fontWeight: 800,
                        }}
                      >
                        TIER {t.tier}
                      </span>
                      <p
                        style={{
                          margin: 0,
                          fontSize: 22,
                          fontWeight: 900,
                          lineHeight: 1.2,
                          color: unlocked ? TEXT : MUTED,
                          textShadow: unlocked ? `0 0 10px ${t.glow}` : "none",
                        }}
                      >
                        {t.name}
                      </p>
                      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.35, color: MUTED, fontStyle: "italic" }}>
                        “{t.tagline}”
                      </p>

                      {/* Full description */}
                      <p
                        style={{
                          margin: "4px 0 0",
                          fontSize: 13,
                          lineHeight: 1.5,
                          color: MUTED,
                        }}
                      >
                        {t.description}
                      </p>



                      {/* Hours range tag */}
                      <span
                        style={{
                          marginTop: 10,
                          display: "inline-block",
                          fontSize: 13,
                          fontWeight: 900,
                          letterSpacing: "0.14em",
                          textTransform: "uppercase",
                          whiteSpace: "nowrap",
                          padding: "5px 14px",
                          borderRadius: 999,
                          color: unlocked ? NEON : MUTED,
                          background: unlocked ? `${GOLD_SOFT}` : "transparent",
                          border: `1px solid ${GOLD_SOFT}`,
                        }}
                      >
                        {t.min}
                        {t.max === Infinity ? "+" : `–${t.max}`} HRS
                      </span>

                      {active && (
                        <p
                          style={{
                            margin: 0,
                            fontSize: 10,
                            fontWeight: 800,
                            letterSpacing: "0.14em",
                            textTransform: "uppercase",
                            color: GOLD,
                          }}
                        >
                          {`Current · ${metrics.hours.toFixed(1)}h`}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <p style={{ marginTop: 8, fontSize: 10, color: MUTED, textAlign: "center", letterSpacing: "0.14em" }}>
              Ranks recalculate every Sunday 23:59 based on total logged focus hours.
            </p>
            <p
              style={{
                marginTop: 6,
                fontSize: 10,
                color: MUTED,
                textAlign: "center",
                letterSpacing: "0.14em",
              }}
            >
              Minimum 20 weekly focus hours required to enter Level 1 (Novice Scholar).
            </p>
            </div>
          </div>
        </div>

        {/* ============ SECTION 4 · WEEKLY CHAPTER REVISION LOG (own page) ============ */}
        <div
          data-report-section="4"
          style={{
            ...page,
            breakBefore: "page",
            pageBreakBefore: "always",
            breakInside: "auto",
            pageBreakInside: "auto",
            marginTop: 0,
          }}
        >
          <div data-grunge="frame" style={grungeFrame} />
          <div data-grunge="border" style={grungeBorder} />
          <div style={{ position: "relative", zIndex: 1 }}>
            <div>
              <div style={{ borderTop: `1px solid ${GOLD_SOFT}`, marginBottom: 10 }} />
              <p
                style={{
                  margin: 0,
                  fontSize: 12,
                  fontWeight: 900,
                  letterSpacing: "0.26em",
                  textTransform: "uppercase",
                  color: GOLD,
                  textAlign: "center",
                }}
              >
                {view === "weekly" ? "Weekly" : "Monthly"} Chapter Revision Log
              </p>
              <div style={{ borderTop: `1px solid ${GOLD_SOFT}`, marginTop: 10 }} />

              <ul
                style={{
                  listStyle: "none",
                  margin: "14px 0 0",
                  padding: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  breakInside: "auto",
                  pageBreakInside: "auto",
                }}
              >
                {revisionEntries.map((r, i) => (
                  <li
                    key={`${r.chapter}-${r.date}-${i}`}
                    style={{
                      fontSize: 13,
                      color: TEXT,
                      fontWeight: 600,
                      breakInside: "avoid",
                      pageBreakInside: "avoid",
                    }}
                  >
                    <span style={{ color: GOLD }}>•</span>{" "}
                    {r.chapter} — <span style={{ color: NEON }}>{r.minutes} Mins Revision</span>{" "}
                    <span style={{ color: MUTED }}>({r.date})</span>
                  </li>
                ))}
              </ul>

              <p
                style={{
                  margin: "16px 0 0",
                  display: "inline-block",
                  padding: "7px 16px",
                  borderRadius: 999,
                  border: `1px solid ${GOLD}`,
                  background: GOLD_SOFT,
                  color: TEXT,
                  fontSize: 11,
                  fontWeight: 900,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                }}
              >
                Total Chapter Revision Time: {formatRevisionTotal(revisionTotalMinutes)}
              </p>
            </div>
          </div>
        </div>

      </div>
    );

  },

);

function MiniStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div
      style={{
        background: PANEL_2,
        borderRadius: 6,
        padding: "8px 10px",
      }}
    >
      <p
        style={{
          fontSize: 8,
          fontWeight: 700,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: MUTED,
          margin: 0,
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: 16,
          fontWeight: 800,
          color: accent ?? TEXT,
          margin: "2px 0 0",
        }}
      >
        {value}
      </p>
    </div>
  );
}

// Weekly hours indicator (unused but exported for future integrations)
export { weeklyFocusHours, monthlyFocusHours };


