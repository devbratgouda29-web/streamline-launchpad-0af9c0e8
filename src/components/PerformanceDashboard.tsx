import { useEffect, useMemo, useState } from "react";
import { Download, Flame, CheckCircle2, Loader2, Lock, Trophy } from "lucide-react";

import { WeeklyBadge } from "@/components/WeeklyBadge";
import { CoreShield } from "@/components/CoreShield";
import {
  WEEKLY_TIERS,
  evaluateWeeklyTier,
  monthlyWeeklyBadges,
  rankProgress,
  UNRANKED_MIN_HOURS,
  type WeeklyTier,
} from "@/lib/weekly-badge";

import { monthlyStudyByWeekSubject } from "@/lib/study-sessions";
import { buildArmoryGroups } from "@/lib/armory";
import type { HabitLite, LedgerRow } from "@/lib/report-data";
import { cn } from "@/lib/utils";

const GOLD = "#D4AF37";
const BAR_COLOR = "#5EEAD4";
const THRESHOLDS = [30, 40, 50, 60, 70];
const HABIT_SHIELD_TIERS = [
  { min: 60, color: "#F5F3FF", glow: "rgba(245,243,255,0.55)" },
  { min: 30, color: "#E2E8F0", glow: "rgba(226,232,240,0.5)" },
  { min: 15, color: "#7DD3FC", glow: "rgba(125,211,252,0.55)" },
  { min: 7, color: "#B0B4BC", glow: "rgba(176,180,188,0.5)" },
  { min: 1, color: "#CD7F32", glow: "rgba(205,127,50,0.55)" },
  { min: 0, color: "#64748B", glow: "rgba(100,116,139,0.4)" },
];
function habitShield(streak: number) {
  return HABIT_SHIELD_TIERS.find((t) => streak >= t.min) ?? HABIT_SHIELD_TIERS[5];
}

type TabId = "overview" | "ledger" | "hierarchy";


export type DashboardMetrics = {
  hours: number;
  retention: number;
  habitScore: number;
  hoursSaved: number;
  badgesRestored: number;
  tier: WeeklyTier | null;
};

export function PerformanceDashboard({
  metrics,
  ledger,
  habits,
  view,
  onExport,
  exporting,
  exportLabel,
  canExport,
}: {
  metrics: DashboardMetrics;
  ledger: LedgerRow[];
  habits: HabitLite[];
  view: "weekly" | "monthly";
  onExport: () => void;
  exporting: boolean;
  exportLabel: string;
  canExport: boolean;
}) {
  const [tab, setTab] = useState<TabId>("overview");


  const loggedHours = Math.max(0, Number(metrics?.hours) || 0);
  const tierGlow = metrics?.tier?.glow ?? "rgba(212,175,55,0.35)";

  // Unranked users progress toward the Level 1 entry requirement; ranked users
  // progress toward the next tier. 0 logged hours renders exactly 0%.
  const rank = rankProgress(loggedHours);


  return (
    <div className="flex flex-col gap-4">
      {/* ---------- TOP BAR ---------- */}
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent-amber">
            Grand Performance
          </p>
          <h1 className="truncate text-xl font-bold leading-tight">Report</h1>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <button
            onClick={onExport}
            disabled={exporting || !canExport}
            title={canExport ? "Export PDF" : exportLabel}
            className="flex shrink-0 items-center gap-2 rounded-full border border-accent-amber/70 bg-accent-amber/10 px-4 py-2.5 text-xs font-bold text-accent-amber transition-colors disabled:opacity-50"
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : canExport ? (
              <Download className="h-4 w-4" />
            ) : (
              <Lock className="h-4 w-4" />
            )}
            {exporting ? "Generating PDF…" : canExport ? "Export PDF" : "Locked"}
          </button>
          {!canExport && (
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {view === "monthly" ? "Available at month's end" : "Available at week's end"}
            </span>
          )}
        </div>

      </header>

      {/* ---------- HERO RANK CARD ---------- */}
      <section
        className="relative overflow-hidden rounded-3xl border border-border p-4 pr-2 pt-2"
        style={{
          background:
            `radial-gradient(120% 90% at 80% 0%, ${tierGlow} 0%, transparent 62%), linear-gradient(180deg, rgba(255,255,255,0.04), rgba(0,0,0,0))`,
          boxShadow: `0 0 50px -26px ${tierGlow}`,
        }}
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1">
          <div className="min-w-0 pt-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              {view === "weekly" ? "This Week" : "This Month"}
            </p>
            <p className={cn("truncate text-2xl font-black", metrics?.tier?.accent ?? "text-foreground")}>
              {metrics?.tier?.name ?? "UNRANKED"}
            </p>
            <p className="mt-0.5 text-[11px] italic text-muted-foreground">
              {metrics?.tier?.tagline ??
                `${UNRANKED_MIN_HOURS.toFixed(1)} weekly focus hours unlock Level 1.`}
            </p>
            <p className="mt-2 text-3xl font-black tabular-nums">
              {loggedHours.toFixed(1)}
              <span className="ml-1 text-sm font-bold text-muted-foreground">hrs</span>
            </p>
          </div>
          <WeeklyBadge tier={metrics?.tier ?? null} size="hero" className="-mr-1 shrink-0" />
        </div>


        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">
              <span className="font-bold text-foreground">
                {(rank?.hours ?? 0).toFixed(1)} / {(rank?.target ?? 0).toFixed(1)} hrs
              </span>{" "}
              {(rank?.percent ?? 0) >= 100 && !rank?.unranked
                ? "logged this cycle"
                : `to ${rank?.targetName ?? "next tier"}`}
            </span>

            <span className="font-bold" style={{ color: GOLD }}>
              {Math.round(rank?.percent ?? 0)}%
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full transition-[width] duration-1000 ease-out"
              style={{
                width: `${rank?.percent ?? 0}%`,
                background: `linear-gradient(90deg, ${GOLD}, ${tierGlow})`,
                boxShadow: `0 0 14px ${tierGlow}`,

              }}
            />
          </div>
        </div>

      </section>


      {/* ---------- TABS ---------- */}
      <nav className="grid grid-cols-3 gap-1 rounded-2xl border border-border bg-card p-1 text-[11px] font-bold">
        {(
          [
            ["overview", "Overview"],
            ["ledger", "Field Ledger"],
            ["hierarchy", "Rank Path"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "rounded-xl py-2.5 transition-colors",
              tab === id ? "bg-primary text-primary-foreground" : "text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "overview" && <OverviewTab habits={habits ?? []} />}
      {tab === "ledger" && <LedgerTab ledger={ledger ?? []} />}
      {tab === "hierarchy" && (
        <HierarchyTab current={metrics?.tier ?? WEEKLY_TIERS[0]} hours={loggedHours} />
      )}

    </div>
  );
}

/* ------------------------------- OVERVIEW ------------------------------- */

function OverviewTab({ habits }: { habits: HabitLite[] }) {

  const [buckets, setBuckets] = useState(
    () => [] as ReturnType<typeof monthlyStudyByWeekSubject>,
  );
  const [armory, setArmory] = useState(() => [] as ReturnType<typeof buildArmoryGroups>);
  useEffect(() => {
    try {
      setBuckets(monthlyStudyByWeekSubject());
    } catch {
      setBuckets([]);
    }
    try {
      setArmory(buildArmoryGroups());
    } catch {
      setArmory([]);
    }
  }, []);

  const safeBuckets =
    buckets.length > 0
      ? buckets
      : [1, 2, 3, 4].map((i) => ({ label: `Week ${i}`, total: 0 }) as (typeof buckets)[number]);
  const chartMax = Math.max(80, ...safeBuckets.map((b) => b?.total ?? 0));
  const H = 180;

  return (
    <div className="flex flex-col gap-4">




      {/* Weekly total-hours bars with dashed thresholds */}
      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
            Weekly Hours
          </h2>
          <span className="text-[10px] font-bold text-muted-foreground">
            Thresholds 30 / 40 / 50 / 60 / 70h
          </span>
        </div>
        <div className="relative flex items-end gap-3 pt-2 pr-11" style={{ height: H + 46 }}>
          {THRESHOLDS.map((t) => (
            <div
              key={t}
              aria-hidden
              className="absolute left-0 right-10 z-10"
              style={{ bottom: (t / chartMax) * H + 38, borderTop: `1px dashed ${GOLD}66` }}
            >
              {/* Sharp gold pill is the ONLY scale marker — no faint y-axis
                  numbers behind the bars, so nothing collides. */}
              <span
                className="absolute -top-2 -right-10 rounded-full px-1.5 text-[9px] font-black leading-4 tabular-nums"
                style={{ background: GOLD, color: "#0A0D14" }}
              >
                {t}h
              </span>
            </div>
          ))}
          {safeBuckets.map((b, i) => {
            const total = Math.max(0, Number(b?.total) || 0);
            const label = b?.label ?? `Week ${i + 1}`;
            return (
              <div key={label} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                <div className="flex w-[68%] items-end rounded-md bg-background/60" style={{ height: H }}>
                  <div
                    className="w-full rounded-md transition-[height] duration-700"
                    title={`${label}: ${total.toFixed(1)}h`}
                    style={{
                      height: Math.max(total > 0 ? 4 : 0, (total / chartMax) * H),
                      background: BAR_COLOR,
                      boxShadow: `0 0 14px ${BAR_COLOR}55`,
                    }}
                  />
                </div>
                <p className="text-[10px] font-bold tabular-nums">{total.toFixed(1)}h</p>
                <p className="truncate text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                  {label}
                </p>
              </div>
            );
          })}

        </div>
      </section>

      {/* Habit tracker grid */}
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
          Habit Tracker
        </h2>
        {(habits?.length ?? 0) === 0 ? (
          <p className="text-xs text-muted-foreground">No habits logged yet.</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {(habits ?? []).slice(0, 8).map((h, i) => {
              const streak = Math.max(0, Number(h?.streak) || 0);
              const name = h?.name ?? `Habit ${i + 1}`;
              const sh = habitShield(streak);
              return (
                <div
                  key={`${name}-${i}`}
                  className="flex w-full items-center gap-4 rounded-2xl border border-border bg-background/50 px-4 py-3"
                >
                  <CoreShield color={sh?.color ?? "#64748B"} glow={sh?.glow ?? "rgba(100,116,139,0.4)"} size={68} label={name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-bold leading-tight">
                      {h?.emoji ? `${h.emoji} ` : ""}
                      {name}
                    </p>
                    <span className="mt-1 flex items-center gap-1 text-[12px] font-black text-emerald-400">
                      <Flame className="h-3.5 w-3.5" /> {streak} days
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Armory Wall */}
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
          Armory Wall · Active Cores
        </h2>
        <div className="grid grid-cols-5 items-start gap-1">
          {(armory ?? []).map((g) => (
            <div key={g?.key} className="flex min-w-0 flex-col items-center gap-2 text-center">
              <CoreShield
                color={g?.color ?? "#64748B"}
                glow={g?.glow ?? "rgba(100,116,139,0.4)"}
                size={104}
                fluid
                label={g?.label ?? ""}
                tier={([1, 2, 3, 4, 5] as const)[Number(String(g?.key ?? "t1").slice(1)) - 1] ?? 1}
              />
              <p className="text-[8px] font-black uppercase leading-tight tracking-[0.06em]" style={{ color: g?.color }}>

                {g?.label}
              </p>
              <div className="flex flex-col gap-0.5">
                {(g?.entries?.length ?? 0) === 0 ? (
                  <span className="text-[9px] text-muted-foreground">—</span>
                ) : (
                  (g?.entries ?? []).slice(0, 4).map((e) => (
                    <span key={e?.name} className="text-[9px] leading-tight text-muted-foreground">
                      {e?.name}
                      {(e?.count ?? 0) > 1 ? ` x ${e.count}` : ""}
                    </span>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
}

/* ------------------------------ FIELD LEDGER ---------------------------- */

function LedgerTab({ ledger }: { ledger: LedgerRow[] }) {
  const [weeks, setWeeks] = useState(() => [] as ReturnType<typeof monthlyWeeklyBadges>);
  useEffect(() => {
    try {
      setWeeks(monthlyWeeklyBadges());
    } catch {
      setWeeks([]);
    }
  }, []);

  return (
    <div className="flex flex-col gap-4">
    <section className="overflow-hidden rounded-2xl border border-border bg-card">

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="bg-background/60 text-[9px] font-black uppercase tracking-[0.12em] text-muted-foreground">
              <th className="px-2 py-2.5 leading-tight">Date</th>
              <th className="px-2 py-2.5 leading-tight">Woke-Up</th>
              <th className="px-2 py-2.5 leading-tight">Study Hours</th>
              <th className="px-2 py-2.5 leading-tight">Tasks</th>
              <th className="px-2 py-2.5 leading-tight">Ghost Tasks</th>
            </tr>
          </thead>
          <tbody>
            {(ledger ?? []).map((row, i) => (
              <tr
                key={row?.key ?? i}
                className={cn(
                  "border-t border-border text-[11px] tabular-nums",
                  row?.isToday && "bg-accent-amber/5",
                )}
              >
                <td className="px-2 py-2.5 font-bold">
                  <span className="text-muted-foreground">{row?.weekday}</span>{" "}
                  <span className="whitespace-nowrap">{row?.dateLabel}</span>
                  {row?.isToday && (
                    <span className="ml-2 rounded-full bg-accent-amber/15 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-accent-amber">
                      Today
                    </span>
                  )}
                </td>
                <td className="px-2 py-2.5">{row?.wake ?? "—"}</td>
                <td className="px-2 py-2.5 font-bold">
                  {(Math.max(0, Number(row?.hours) || 0)).toFixed(1)} hrs
                </td>
                <td className="px-2 py-2.5">
                  {row?.tasksTotal ? `${row?.tasksDone ?? 0}/${row.tasksTotal}` : "—"}
                </td>
                <td className="px-2 py-2.5">
                  {row?.ghostsTotal ? `${row?.ghostsCleared ?? 0}/${row.ghostsTotal}` : "—"}
                </td>
              </tr>
            ))}

          </tbody>
        </table>
      </div>
    </section>

      {/* Monthly Trophy Case */}
      <section className="rounded-2xl border border-accent-amber/40 bg-card p-4">
        <div className="mb-1 flex items-center gap-2">
          <Trophy className="h-4 w-4 text-accent-amber" />
          <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
            Monthly Trophy Case
          </h2>
        </div>
        <p className="mb-3 text-[10px] text-muted-foreground">
          Weekly rank badges unlocked across each week of the month.
        </p>
        <div className="grid grid-cols-4 gap-2">
          {weeks.map((w) => (
            <div
              key={w.label}
              className="flex flex-col items-center gap-1 rounded-xl border border-border bg-background/40 p-2"
            >
              <WeeklyBadge tier={w.tier} size="trophy" locked={!w.hasData} />
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                {w.label}
              </p>
              <p
                className={
                  "text-[10px] " + (w.tier ? w.tier.accent : "text-muted-foreground")
                }
              >
                {w.tier ? `T${w.tier.tier}` : w.hasData ? "Unranked" : "—"}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}


/* ----------------------------- RANK HIERARCHY --------------------------- */

function HierarchyTab({ current, hours }: { current: WeeklyTier | null; hours: number }) {
  const currentIdx = WEEKLY_TIERS.findIndex((t) => t.id === current?.id);
  const safeHours = Math.max(0, Number(hours) || 0);
  return (
    <div className="flex flex-col">
      {WEEKLY_TIERS.map((t, i) => {
        const unlocked = i <= currentIdx;
        const isCurrent = i === currentIdx;
        return (
          <div key={t.id}>
            <div
              className={cn(
                "grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4 rounded-3xl border px-4 py-2",
                isCurrent ? "bg-card" : "bg-card/50",
              )}
              style={{
                borderColor: isCurrent ? GOLD : "hsl(var(--border))",
                boxShadow: isCurrent ? `0 0 40px -10px ${GOLD}` : undefined,
                opacity: unlocked ? 1 : 0.65,
              }}
            >
              <div className="grid min-w-[150px] place-items-center py-0">
                <WeeklyBadge tier={t} size="rank" locked={!unlocked} />
              </div>

              <div className="min-w-0">
                <p
                  className={cn(
                    "text-2xl font-black leading-tight",
                    unlocked ? t.accent : "text-muted-foreground",
                  )}
                >
                  {t.name}
                </p>
                <p className="mt-1 text-[13px] italic text-muted-foreground">{t.tagline}</p>
                <p className="mt-2 text-sm font-black uppercase tracking-[0.12em] text-foreground">
                  {t.max === Infinity ? `${t.min}+ hrs` : `${t.min}–${t.max} hrs`}
                </p>
                <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  {unlocked ? (
                    <CheckCircle2 className="h-3.5 w-3.5" style={{ color: GOLD }} />
                  ) : (
                    <Lock className="h-3.5 w-3.5" />
                  )}
                  {isCurrent ? (
                    <span style={{ color: GOLD }}>Current · {safeHours.toFixed(1)}h</span>
                  ) : unlocked ? (
                    "Unlocked"
                  ) : (
                    "Locked"
                  )}
                </p>
              </div>
            </div>

            {i < WEEKLY_TIERS.length - 1 && (
              <div className="flex h-10 items-center justify-center" aria-hidden>
                <span
                  className="h-full w-[5px] rounded-full"
                  style={{
                    background: unlocked
                      ? `linear-gradient(180deg, ${GOLD}, ${GOLD}55)`
                      : "rgba(255,255,255,0.14)",
                    boxShadow: unlocked ? `0 0 16px ${GOLD}` : undefined,
                  }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}


export { evaluateWeeklyTier };
