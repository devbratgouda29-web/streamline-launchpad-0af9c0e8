import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Flag, Pause, Play, RotateCcw, Timer } from "lucide-react";
import { DisciplineTimeNav } from "@/components/DisciplineTimeNav";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/discipline/stopwatch")({
  head: () => ({
    meta: [
      { title: "Stopwatch — Discipline Hub" },
      {
        name: "description",
        content:
          "Precision stopwatch with start, pause, reset and lap recording for timed study sprints.",
      },
      { property: "og:title", content: "Stopwatch — Discipline Hub" },
      {
        property: "og:description",
        content: "Time your study sprints with laps, pause and reset.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StopwatchPage,
});

function format(ms: number) {
  const total = Math.max(0, ms);
  const mins = Math.floor(total / 60000);
  const secs = Math.floor((total % 60000) / 1000);
  const cs = Math.floor((total % 1000) / 10);
  return {
    main: `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`,
    cs: String(cs).padStart(2, "0"),
  };
}

function StopwatchPage() {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [laps, setLaps] = useState<number[]>([]);
  const startedAt = useRef(0);
  const baseRef = useRef(0);

  useEffect(() => {
    if (!running) return;
    startedAt.current = performance.now();
    let raf = 0;
    const tick = () => {
      setElapsed(baseRef.current + (performance.now() - startedAt.current));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running]);

  const toggle = useCallback(() => {
    setRunning((r) => {
      if (r) baseRef.current = elapsed;
      return !r;
    });
  }, [elapsed]);

  const reset = useCallback(() => {
    setRunning(false);
    baseRef.current = 0;
    setElapsed(0);
    setLaps([]);
  }, []);

  const lap = useCallback(() => {
    setLaps((l) => [elapsed, ...l]);
  }, [elapsed]);

  const t = format(elapsed);
  const lapDeltas = laps.map((v, i) => v - (laps[i + 1] ?? 0));
  const best = lapDeltas.length > 1 ? Math.min(...lapDeltas) : -1;
  const worst = lapDeltas.length > 1 ? Math.max(...lapDeltas) : -1;

  return (
    <div className="flex flex-col gap-6 px-5 pt-6 pb-8">
      <header className="flex items-center gap-3">
        <Link
          to="/discipline"
          className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground"
          aria-label="Back to Discipline hub"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent-amber">
            Discipline · Section B
          </p>
          <h1 className="text-2xl">Stopwatch</h1>
        </div>
      </header>

      <DisciplineTimeNav />

      <section className="rounded-2xl border border-border bg-card p-6 text-center">
        <p className="flex items-center justify-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          <Timer className="h-3.5 w-3.5" /> Elapsed
        </p>
        <p className="mt-2 font-mono text-5xl tabular-nums text-foreground">
          {t.main}
          <span className="ml-1 text-2xl text-accent-amber">.{t.cs}</span>
        </p>

        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            disabled={elapsed === 0 && laps.length === 0}
            className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
            aria-label="Reset stopwatch"
          >
            <RotateCcw className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={toggle}
            className={cn(
              "flex h-20 w-20 items-center justify-center rounded-full font-black transition-transform active:scale-95",
              running
                ? "bg-primary text-primary-foreground"
                : "bg-accent-amber text-accent-amber-foreground",
            )}
            aria-label={running ? "Pause stopwatch" : "Start stopwatch"}
          >
            {running ? <Pause className="h-7 w-7" /> : <Play className="h-7 w-7" />}
          </button>
          <button
            type="button"
            onClick={lap}
            disabled={!running}
            className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
            aria-label="Record lap"
          >
            <Flag className="h-5 w-5" />
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Laps ({laps.length})
        </h2>
        {laps.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No laps yet. Hit the flag while running to record a split.
          </p>
        ) : (
          <ul className="mt-3 flex max-h-72 flex-col overflow-auto">
            {laps.map((total, i) => {
              const d = lapDeltas[i];
              const df = format(d);
              const tf = format(total);
              return (
                <li
                  key={`${i}-${total}`}
                  className="flex items-center justify-between border-b border-border/60 py-2 text-sm last:border-0"
                >
                  <span className="font-semibold text-muted-foreground">
                    Lap {laps.length - i}
                  </span>
                  <span
                    className={cn(
                      "font-mono tabular-nums",
                      d === best && "text-accent-amber",
                      d === worst && "text-primary",
                    )}
                  >
                    +{df.main}.{df.cs}
                  </span>
                  <span className="font-mono tabular-nums text-muted-foreground">
                    {tf.main}.{tf.cs}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
