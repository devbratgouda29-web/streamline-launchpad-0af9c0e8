import { Link } from "@tanstack/react-router";
import { AlarmClock, Timer } from "lucide-react";

/** Segmented Alarm / Stopwatch switcher for the Discipline time tools. */
export function DisciplineTimeNav() {
  const base =
    "flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-black uppercase tracking-widest transition-colors";
  return (
    <nav className="flex gap-1 rounded-2xl border border-border bg-card p-1">
      <Link
        to="/discipline/alarm"
        className={base}
        activeProps={{ className: "bg-accent-amber text-accent-amber-foreground" }}
        inactiveProps={{ className: "text-muted-foreground hover:text-foreground" }}
      >
        <AlarmClock className="h-4 w-4" /> Alarm
      </Link>
      <Link
        to="/discipline/stopwatch"
        className={base}
        activeProps={{ className: "bg-accent-amber text-accent-amber-foreground" }}
        inactiveProps={{ className: "text-muted-foreground hover:text-foreground" }}
      >
        <Timer className="h-4 w-4" /> Stopwatch
      </Link>
    </nav>
  );
}
