import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ListChecks,
  Lock,
  Rocket,
  Trophy,
  X,
  CheckCircle2,
  CalendarDays,
  Plus,
  Ghost,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getGhostTasks,
  subscribe as subscribeRevision,
  type GhostTask,
} from "@/lib/revision-engine";
import { loadRevisionLogs, type RevisionLog } from "@/lib/revision-logs";


export const Route = createFileRoute("/_app/discipline/mission")({
  head: () => ({
    meta: [
      { title: "Mission Lockdown — From The Last Bench" },
      {
        name: "description",
        content:
          "Lock in unlimited daily missions for 24 hours. No edits, no excuses — clear them before the timer or roll them into tomorrow.",
      },
    ],
  }),
  component: MissionLockdownPage,
});

/* ----------------------------- Types & Storage ----------------------------- */

type Task = { id: string; text: string; done: boolean };
type DayResult = "win" | "loss" | "pending";
type MissionDay = {
  date: string; // YYYY-MM-DD (local)
  tasks: Task[];
  startedAt: number;
  expiresAt: number;
  result: DayResult;
};
type MissionState = {
  active: MissionDay | null;
  history: MissionDay[];
};

const STORAGE_KEY = "ftlb.mission.v1";
const DAY_MS = 24 * 60 * 60 * 1000;

function todayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function loadState(): MissionState {
  if (typeof window === "undefined") return { active: null, history: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { active: null, history: [] };
    const parsed = JSON.parse(raw) as MissionState;
    return {
      active: parsed.active ?? null,
      history: Array.isArray(parsed.history) ? parsed.history : [],
    };
  } catch {
    return { active: null, history: [] };
  }
}

function saveState(s: MissionState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "00:00:00";
  const total = Math.floor(ms / 1000);
  const h = String(Math.floor(total / 3600)).padStart(2, "0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

/* --------------------------------- Page ---------------------------------- */

function MissionLockdownPage() {
  const [hydrated, setHydrated] = useState(false);
  const [state, setState] = useState<MissionState>({
    active: null,
    history: [],
  });
  const [drafts, setDrafts] = useState<string[]>([""]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [now, setNow] = useState<number>(() => Date.now());
  const [viewDay, setViewDay] = useState<MissionDay | null>(null);
  const [showWin, setShowWin] = useState(false);
  const winShownRef = useRef<string | null>(null);
  const [ghosts, setGhosts] = useState<GhostTask[]>([]);

  // Keep ghost tasks fresh: on hydrate, every 30s, and on engine mutations.
  useEffect(() => {
    const refresh = () => setGhosts(getGhostTasks());
    refresh();
    const unsub = subscribeRevision(refresh);
    const id = window.setInterval(refresh, 30_000);
    return () => {
      unsub();
      window.clearInterval(id);
    };
  }, []);

  // Hydrate from localStorage
  useEffect(() => {
    setState(loadState());
    setHydrated(true);
  }, []);

  // Persist
  useEffect(() => {
    if (hydrated) saveState(state);
  }, [state, hydrated]);

  // Tick every second while there's an active mission
  useEffect(() => {
    if (!state.active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [state.active]);

  /* -------- Expiry / rollover handling -------- */
  useEffect(() => {
    if (!hydrated) return;
    const a = state.active;
    if (!a) return;
    if (now < a.expiresAt) return;
    // Timer expired
    const allDone = a.tasks.length > 0 && a.tasks.every((t) => t.done);
    const finished: MissionDay = {
      ...a,
      result: allDone ? "win" : "loss",
    };
    // Rollover uncompleted tasks to fresh day
    const remaining = a.tasks.filter((t) => !t.done);
    let nextActive: MissionDay | null = null;
    if (!allDone && remaining.length > 0) {
      const start = Date.now();
      nextActive = {
        date: todayKey(new Date(start)),
        tasks: remaining.map((t) => ({ ...t, id: newId(), done: false })),
        startedAt: start,
        expiresAt: start + DAY_MS,
        result: "pending",
      };
    }
    setState((s) => ({
      active: nextActive,
      history: [finished, ...s.history].slice(0, 200),
    }));
  }, [now, hydrated, state.active]);

  /* -------- Win detection -------- */
  useEffect(() => {
    const a = state.active;
    if (!a || a.tasks.length === 0) return;
    const allDone = a.tasks.every((t) => t.done);
    if (allDone && winShownRef.current !== a.date + a.startedAt) {
      winShownRef.current = a.date + a.startedAt;
      setShowWin(true);
    }
  }, [state.active]);

  const activateMission = () => {
    const cleaned = drafts.map((d) => d.trim()).filter(Boolean);
    if (cleaned.length === 0) return;
    const start = Date.now();
    const active: MissionDay = {
      date: todayKey(new Date(start)),
      tasks: cleaned.map((text) => ({ id: newId(), text, done: false })),
      startedAt: start,
      expiresAt: start + DAY_MS,
      result: "pending",
    };
    setState((s) => ({ ...s, active }));
    setConfirmOpen(false);
    setDrafts([""]);
  };

  const toggleTask = (id: string) => {
    setState((s) => {
      if (!s.active) return s;
      return {
        ...s,
        active: {
          ...s.active,
          tasks: s.active.tasks.map((t) =>
            t.id === id ? { ...t, done: !t.done } : t,
          ),
        },
      };
    });
  };

  const claimWinAndReset = () => {
    setShowWin(false);
    setState((s) => {
      if (!s.active) return s;
      const finished: MissionDay = { ...s.active, result: "win" };
      return {
        active: null,
        history: [finished, ...s.history].slice(0, 200),
      };
    });
  };

  const addDraft = () => setDrafts((d) => [...d, ""]);
  const removeDraft = (idx: number) =>
    setDrafts((d) => (d.length <= 1 ? [""] : d.filter((_, i) => i !== idx)));

  const active = state.active;
  const doneCount = active ? active.tasks.filter((t) => t.done).length : 0;
  const totalCount = active ? active.tasks.length : 0;
  const remainingMs = active ? Math.max(0, active.expiresAt - now) : 0;
  const expired = !!active && remainingMs <= 0;

  return (
    <div className="flex flex-col gap-5 px-5 pb-24 pt-4">
      {/* Pinned countdown */}
      {active && (
        <div className="sticky top-0 z-30 -mx-5 border-b border-border/60 bg-background/95 px-5 py-3 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent-amber">
                Mission Active · {active.date}
              </p>
              <p className="truncate text-sm font-bold">
                {doneCount}/{totalCount} tasks done
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Time Left
              </p>
              <p className="font-mono text-lg font-bold tabular-nums text-primary">
                {formatCountdown(remainingMs)}
              </p>
            </div>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{
                width: `${totalCount === 0 ? 0 : (doneCount / totalCount) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      <header className="flex flex-col gap-2">
        <Link
          to="/discipline"
          className="inline-flex w-fit items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Discipline Hub
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent-amber">
            Discipline · Section D
          </span>
        </div>
        <h1 className="text-2xl font-bold leading-tight">
          Mission Lockdown To-Do
        </h1>
        <p className="text-sm text-muted-foreground">
          Add as many missions as you need. Once you lock in — no edits for 24 hours.
        </p>
      </header>

      {/* Ghost Tasks — auto-injected by the Revision Engine when overdue */}
      {ghosts.length > 0 && (
        <section className="relative overflow-hidden rounded-2xl border border-purple-500/40 bg-[oklch(0.12_0.05_290)] p-4 text-purple-100 shadow-[0_0_40px_-20px_rgba(168,85,247,0.65)]">
          <div className="pointer-events-none absolute inset-0 opacity-40" style={{
            background:
              "radial-gradient(circle at 15% 20%, rgba(168,85,247,0.25), transparent 60%), radial-gradient(circle at 85% 80%, rgba(236,72,153,0.2), transparent 60%)",
          }} />
          <div className="relative mb-3 flex items-center gap-2">
            <Ghost className="h-4 w-4 text-purple-300" />
            <h2 className="min-w-0 flex-1 truncate text-sm font-bold uppercase tracking-wide">
              Ghost Task
            </h2>
            <span className="shrink-0 rounded-full bg-purple-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-purple-200">
              {ghosts.length} haunting
            </span>
          </div>
          <ul className="relative flex flex-col gap-2">
            {ghosts.map((g) => (
              <li key={g.id}>
                <Link
                  to="/recall/$itemId"
                  params={{ itemId: g.itemId }}
                  title={g.title}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-purple-500/30 bg-black/30 px-3 py-2.5 transition-colors hover:border-purple-400/60 hover:bg-black/50 active:scale-[0.99]"
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-purple-500/20 text-purple-200">
                    <Ghost className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-purple-50">
                    {g.chapterName}
                  </span>
                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.12em] text-purple-300">
                    {g.dueTomorrow ? "Due Tomorrow" : g.graceLabel}
                  </span>
                  <span className="shrink-0 rounded-full bg-purple-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-purple-200">
                    {g.durationMin} min
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <p className="relative mt-3 text-[11px] text-purple-200/70">
            The forgetting curve summoned these. Clear them before they compound.
          </p>
        </section>
      )}

      {/* Task list / editor */}
      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-bold uppercase tracking-wide">
            {active ? "Today's Locked Missions" : "Draft Missions"}
          </h2>
          {active && (
            <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-primary">
              <Lock className="h-3 w-3" /> Locked
            </span>
          )}
        </div>

        <ul className="flex flex-col gap-2">
          {(active ? active.tasks : drafts).map((item, idx) => {
            if (active) {
              const t = item as Task;
              const showX = expired && !t.done;
              return (
                <li
                  key={t.id}
                  className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/50 px-3 py-2.5"
                >
                  {showX ? (
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-destructive/20 text-destructive">
                      <X className="h-5 w-5" strokeWidth={3} />
                    </span>
                  ) : (
                    <Checkbox
                      checked={t.done}
                      onCheckedChange={() => toggleTask(t.id)}
                      className="h-5 w-5"
                    />
                  )}
                  <span
                    className={`flex-1 text-sm ${
                      t.done
                        ? "line-through opacity-40"
                        : showX
                          ? "text-destructive"
                          : ""
                    }`}
                  >
                    {t.text}
                  </span>
                </li>
              );
            }
            const text = item as string;
            return (
              <li key={idx} className="flex items-center gap-2">
                <span className="w-5 text-center text-xs font-bold text-muted-foreground">
                  {idx + 1}
                </span>
                <Input
                  value={text}
                  onChange={(e) => {
                    const next = [...drafts];
                    next[idx] = e.target.value.slice(0, 120);
                    setDrafts(next);
                  }}
                  placeholder={`Mission #${idx + 1}`}
                  className="h-10"
                />
                {drafts.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeDraft(idx)}
                    aria-label={`Remove mission ${idx + 1}`}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        {!active && (
          <>
            <button
              type="button"
              onClick={addDraft}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border/70 bg-background/40 px-3 py-2.5 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
            >
              <Plus className="h-4 w-4" /> Add Mission
            </button>
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={drafts.every((d) => !d.trim())}
              className="mt-3 w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
              size="lg"
            >
              <Rocket className="h-4 w-4" />
              Ready to go on this mission?
            </Button>
          </>
        )}
      </section>

      {/* Failure state (expired with pending) */}
      {active && expired && active.tasks.some((t) => !t.done) && (
        <section className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-center">
          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-2xl border-2 border-dashed border-destructive/40 bg-destructive/5">
            <img
              src="/assets/stickman_fail.png"
              alt="Crying stickman — mission failed"
              className="max-h-full max-w-full"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
          <p className="mt-2 text-sm font-bold uppercase tracking-wide text-destructive">
            Mission Failed
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Uncompleted missions will roll over to tomorrow.
          </p>
        </section>
      )}

      {/* History diary */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-accent-amber" />
          <h2 className="text-sm font-bold uppercase tracking-wide">
            Mission Diary
          </h2>
        </div>
        {state.history.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            No past missions yet. Lock in your first mission above.
          </p>
        ) : (
          <div className="max-h-72 overflow-y-auto pr-1">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {state.history.map((d, i) => {
                const isWin = d.result === "win";
                return (
                  <button
                    key={d.date + d.startedAt + i}
                    onClick={() => setViewDay(d)}
                    className={`flex flex-col items-start gap-1 rounded-xl border p-2 text-left transition-colors ${
                      isWin
                        ? "border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20"
                        : "border-destructive/40 bg-destructive/10 hover:bg-destructive/20"
                    }`}
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      {d.date.slice(5)}
                    </span>
                    <span
                      className={`text-xs font-bold uppercase ${
                        isWin ? "text-emerald-500" : "text-destructive"
                      }`}
                    >
                      {isWin ? "Win" : "Loss"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {d.tasks.filter((t) => t.done).length}/{d.tasks.length}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Confirm lock modal */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Are you sure, cadet?</DialogTitle>
            <DialogDescription>
              Cause you can't change or modify this task once you say yes.
              The list locks for 24 hours.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={activateMission}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Lock className="mr-1 h-4 w-4" /> Lock In Mission
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View past day */}
      <Dialog open={!!viewDay} onOpenChange={(o) => !o && setViewDay(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Mission · {viewDay?.date}{" "}
              <span
                className={`ml-2 text-xs font-bold uppercase ${
                  viewDay?.result === "win"
                    ? "text-emerald-500"
                    : "text-destructive"
                }`}
              >
                {viewDay?.result}
              </span>
            </DialogTitle>
            <DialogDescription>
              Frozen record — {viewDay?.tasks.filter((t) => t.done).length}/
              {viewDay?.tasks.length} completed.
            </DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col gap-2">
            {viewDay?.tasks.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/50 px-3 py-2"
              >
                {t.done ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : (
                  <X className="h-4 w-4 text-destructive" strokeWidth={3} />
                )}
                <span
                  className={`text-sm ${t.done ? "line-through opacity-40" : ""}`}
                >
                  {t.text}
                </span>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>

      {/* Win overlay */}
      {showWin && <WinOverlay onClose={claimWinAndReset} />}
    </div>
  );
}

/* ------------------------------ Win Overlay ------------------------------ */

function WinOverlay({ onClose }: { onClose: () => void }) {
  const pieces = useMemo(() => {
    const colors = [
      "#ef4444",
      "#f59e0b",
      "#10b981",
      "#3b82f6",
      "#8b5cf6",
      "#ec4899",
    ];
    return Array.from({ length: 80 }).map((_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 2,
      duration: 2 + Math.random() * 2.5,
      color: colors[i % colors.length],
      size: 6 + Math.random() * 8,
      rotate: Math.random() * 360,
    }));
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/90 backdrop-blur">
      <style>{`
        @keyframes ftlb-confetti-fall {
          0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0.9; }
        }
      `}</style>
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {pieces.map((p) => (
          <span
            key={p.id}
            className="absolute top-0 block rounded-sm"
            style={{
              left: `${p.left}%`,
              width: p.size,
              height: p.size * 0.4,
              background: p.color,
              transform: `rotate(${p.rotate}deg)`,
              animation: `ftlb-confetti-fall ${p.duration}s linear ${p.delay}s infinite`,
            }}
          />
        ))}
      </div>
      <div className="relative z-10 flex flex-col items-center gap-4 px-6 text-center">
        <div className="grid h-40 w-40 place-items-center rounded-2xl border-2 border-dashed border-emerald-500/40 bg-emerald-500/10">
          <img
            src="/assets/stickman_win.png"
            alt="Winning stickman"
            className="max-h-full max-w-full"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
          <Trophy
            className="absolute h-16 w-16 text-emerald-400"
            aria-hidden
          />
        </div>
        <h2 className="text-3xl font-black uppercase tracking-wide text-emerald-400">
          Mission Complete
        </h2>
        <p className="text-sm text-muted-foreground">
          Every mission cleared before the timer. Sovereign work, cadet.
        </p>
        <Button
          onClick={onClose}
          size="lg"
          className="bg-emerald-500 text-black hover:bg-emerald-400"
        >
          Claim Victory
        </Button>
      </div>
    </div>
  );
}
