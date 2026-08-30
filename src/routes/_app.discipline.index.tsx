import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ShieldCheck,
  AlarmClock,
  Timer,
  ListChecks,
  Flame,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { evaluateWeeklyTier, weeklyFocusHours } from "@/lib/weekly-badge";
import { WeeklyBadge } from "@/components/WeeklyBadge";

export const Route = createFileRoute("/_app/discipline/")({
  head: () => ({
    meta: [
      { title: "Discipline Hub — From The Last Bench" },
      {
        name: "description",
        content:
          "Sovereign self-control and consistency tools: habit RPG, math-locked alarms, focus analytics, mission lockdown, and The War Council.",
      },
    ],
  }),
  component: DisciplineHub,
});

type Block = {
  id: string;
  title: string;
  subtitle: string;
  desc: string;
  icon: LucideIcon;
  accent: "crimson" | "amber";
};

const blocks: Block[] = [
  {
    id: "habits",
    title: "Habit RPG Tracker",
    subtitle: "Progress rings · 15-tier rank shields",
    desc: "Level up daily habits and climb from Recruit to Sovereign.",
    icon: ShieldCheck,
    accent: "crimson",
  },
  {
    id: "alarm",
    title: "Math-Locked Alarm Clock",
    subtitle: "Un-snoozable morning ignition",
    desc: "Solve to silence. No shortcuts, no snooze, no mercy.",
    icon: AlarmClock,
    accent: "amber",
  },
  {
    id: "focus",
    title: "Focus Analytics Tracker",
    subtitle: "Stopwatch · PiP · bar charts",
    desc: "Track deep-work sessions with a floating picture-in-picture timer.",
    icon: Timer,
    accent: "crimson",
  },
  {
    id: "mission",
    title: "Mission Lockdown To-Do",
    subtitle: "Frozen input · 24h countdown",
    desc: "Lock tomorrow's plan tonight. No edits until the timer ends.",
    icon: ListChecks,
    accent: "amber",
  },
  {
    id: "war-council",
    title: "THE WAR COUNCIL",
    subtitle: "Strategic Hub",
    desc: "Convene with tactical commanders, review performance logs, and fortify your mental focus.",
    icon: Flame,
    accent: "crimson",
  },
];

function DisciplineHub() {
  const [hours, setHours] = useState(0);
  useEffect(() => setHours(weeklyFocusHours()), []);
  const tier = evaluateWeeklyTier(hours);

  return (
    <div className="flex flex-col gap-6 px-5 pt-6">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 items-center rounded-full bg-primary/15 px-2 text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
            Last Bench
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent-amber">
            Discipline Hub
          </span>
        </div>
        <h1 className="text-3xl leading-tight">Forge Your Edge.</h1>
        <p className="text-sm text-muted-foreground">
          Sovereign Self-Control &amp; Consistency
        </p>
      </header>

      <Link
        to="/performance"
        search={{ view: "weekly", wrapped: false }}
        className="group relative flex items-center gap-3 overflow-hidden rounded-2xl border border-accent-amber/50 bg-gradient-to-br from-card via-card to-background p-2"
        style={{ boxShadow: `0 0 32px -14px ${tier?.glow ?? "rgba(255,255,255,0.12)"}` }}
      >
        <WeeklyBadge tier={tier} size="3xl" />
        <div className="min-w-0 flex-1 py-1">
          <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.16em] text-accent-amber">
            <Sparkles className="h-3 w-3" /> Grand Performance Report
          </div>
          <h2 className="text-base font-bold">
            {tier ? `T${tier.tier} · ${tier.name}` : "UNRANKED"}
          </h2>

          <p className="text-[11px] text-muted-foreground">
            {hours.toFixed(1)}h focus this week — tap to play your Wrapped &amp; export PDF.
          </p>
        </div>
        <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-accent-amber" />
      </Link>


      <ul className="flex flex-col gap-3 pb-4">
        {blocks.map((b) => (
          <li key={b.id}>
            <FeatureBlock block={b} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function FeatureBlock({ block }: { block: Block }) {
  const Icon = block.icon;
  const isCrimson = block.accent === "crimson";
  const href =
    block.id === "habits"
      ? "/discipline/habits"
      : block.id === "alarm"
        ? "/discipline/alarm"
        : block.id === "focus"
          ? "/discipline/focus"
          : block.id === "mission"
            ? "/discipline/mission"
            : block.id === "war-council"
              ? "/discipline/war-council"
              : "/discipline";

  return (
    <Link
      to={href}
      className="group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/50"
    >
      {/* Accent side bar */}
      <span
        aria-hidden
        className={
          isCrimson
            ? "absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-primary to-primary/40"
            : "absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-accent-amber to-accent-amber/40"
        }
      />
      <div
        className={
          isCrimson
            ? "grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/30"
            : "grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-accent-amber/15 text-accent-amber ring-1 ring-accent-amber/30"
        }
      >
        <Icon className="h-6 w-6" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {block.subtitle}
        </p>
        <h2 className="text-base font-bold">{block.title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {block.desc}
        </p>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
    </Link>
  );
}
