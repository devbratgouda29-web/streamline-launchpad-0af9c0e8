import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Pause,
  Play,
  PictureInPicture2,
  RotateCcw,
  Timer as TimerIcon,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export const Route = createFileRoute("/_app/discipline/focus")({
  head: () => ({
    meta: [
      { title: "Focus Analytics Tracker — From The Last Bench" },
      {
        name: "description",
        content:
          "Deep-work stopwatch with picture-in-picture floating timer, break penalties, and a 7-day focus analytics chart.",
      },
    ],
  }),
  component: FocusTrackerPage,
});

type DailyMap = Record<string, number>; // date -> totalSecondsFocused
const DAILY_KEY = "ftlb.focus.daily.v2";
const STATE_KEY = "ftlb.focus.state.v1";
const PENALTY_MS = 5 * 60 * 1000;

type PersistedState = {
  running: boolean;
  accumulatedMs: number;
  startedAt: number | null;
  lastCountedSeconds: number; // last stopwatch-seconds value already added to today's total
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function loadDaily(): DailyMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(DAILY_KEY);
    return raw ? (JSON.parse(raw) as DailyMap) : {};
  } catch {
    return {};
  }
}

function saveDaily(map: DailyMap) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DAILY_KEY, JSON.stringify(map));
}

/** Add `delta` seconds to today's totalSecondsFocusedToday counter. */
function addSecondsToToday(delta: number) {
  if (typeof window === "undefined" || delta <= 0) return;
  const map = loadDaily();
  const key = todayKey();
  map[key] = (map[key] ?? 0) + delta;
  saveDaily(map);
}

function loadState(): PersistedState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STATE_KEY);
    return raw ? (JSON.parse(raw) as PersistedState) : null;
  } catch {
    return null;
  }
}

function persistState(s: PersistedState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STATE_KEY, JSON.stringify(s));
}

function clearState() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STATE_KEY);
}

function formatHMS(totalSec: number) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return {
    h: String(h).padStart(2, "0"),
    m: String(m).padStart(2, "0"),
    s: String(s).padStart(2, "0"),
  };
}

function FocusTrackerPage() {
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const runningRef = useRef(running);
  const [pipActive, setPipActive] = useState(false);
  const [logVersion, setLogVersion] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  // Reference clocks: startedAtEpoch is wall-clock ms so a reload can recover elapsed time.
  const startedAtEpochRef = useRef<number | null>(null);
  const accumulatedMsRef = useRef(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const penaltyTimerRef = useRef<number | null>(null);
  const lastCountedSecondsRef = useRef(0);

  // --- Hydrate from localStorage on mount (client only to avoid SSR mismatch) ---
  useEffect(() => {
    const s = loadState();
    if (s) {
      accumulatedMsRef.current = s.accumulatedMs || 0;
      startedAtEpochRef.current = s.running ? s.startedAt ?? Date.now() : null;
      const liveSecs = Math.floor(
        (accumulatedMsRef.current +
          (s.running && startedAtEpochRef.current
            ? Date.now() - startedAtEpochRef.current
            : 0)) /
          1000,
      );
      setSeconds(liveSecs);
      setRunning(!!s.running);

      // Seed lastCounted from persisted state so we never double-count on reload.
      const previouslyCounted = s.lastCountedSeconds ?? 0;
      lastCountedSecondsRef.current = previouslyCounted;

      // If the timer was running while the tab was closed, credit that wall-clock
      // delta to today so the chart matches the stopwatch immediately on reload.
      const recoveredDelta = liveSecs - previouslyCounted;
      if (s.running && recoveredDelta > 0) {
        addSecondsToToday(recoveredDelta);
        lastCountedSecondsRef.current = liveSecs;
        setLogVersion((v) => v + 1);
      }
    }
    setHydrated(true);
  }, []);

  // Keep a ref mirror of running so flush callbacks never use a stale closure.
  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  // Persist state whenever it materially changes.
  useEffect(() => {
    if (!hydrated) return;
    persistState({
      running,
      accumulatedMs: accumulatedMsRef.current,
      startedAt: startedAtEpochRef.current,
      lastCountedSeconds: lastCountedSecondsRef.current,
    });
  }, [running, seconds, hydrated]);

  // --- Ticker (Web Worker so it keeps firing when tab is hidden) ---
  useEffect(() => {
    if (!running || !hydrated) return;
    if (startedAtEpochRef.current == null) {
      startedAtEpochRef.current = Date.now();
    }
    const workerCode =
      "let id=null;onmessage=(e)=>{if(e.data==='start'){clearInterval(id);id=setInterval(()=>postMessage(1),250)}else{clearInterval(id);id=null}}";
    const blob = new Blob([workerCode], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    worker.onmessage = () => {
      const now = Date.now();
      const elapsed = Math.floor(
        (accumulatedMsRef.current + (now - (startedAtEpochRef.current ?? now))) /
          1000,
      );
      setSeconds(elapsed);
    };
    worker.postMessage("start");
    return () => {
      worker.postMessage("stop");
      worker.terminate();
      URL.revokeObjectURL(url);
      if (startedAtEpochRef.current != null) {
        accumulatedMsRef.current += Date.now() - startedAtEpochRef.current;
        startedAtEpochRef.current = null;
      }
    };
  }, [running, hydrated]);

  // --- Canvas → PiP: worker-driven redraws so text keeps updating when tab is hidden ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const now = Date.now();
      const liveSeconds =
        running && startedAtEpochRef.current != null
          ? Math.floor(
              (accumulatedMsRef.current + (now - startedAtEpochRef.current)) /
                1000,
            )
          : Math.floor(accumulatedMsRef.current / 1000);
      const { h, m, s } = formatHMS(liveSeconds);
      ctx.fillStyle = "#0b0b10";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#fbbf24";
      ctx.font = "700 24px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("FOCUS", canvas.width / 2, 38);
      ctx.fillStyle = running ? "#ffffff" : "#94a3b8";
      ctx.font = "700 76px system-ui, sans-serif";
      ctx.fillText(`${h}:${m}:${s}`, canvas.width / 2, 130);
      ctx.fillStyle = running ? "#22c55e" : "#dc2626";
      ctx.font = "600 16px system-ui, sans-serif";
      ctx.fillText(running ? "● LIVE" : "PAUSED — tap ▶ to resume", canvas.width / 2, 170);
      ctx.fillStyle = "#64748b";
      ctx.font = "500 12px system-ui, sans-serif";
      ctx.fillText("From The Last Bench", canvas.width / 2, 200);
    };

    const workerCode = "setInterval(()=>postMessage(1),250)";
    const blob = new Blob([workerCode], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    worker.onmessage = draw;
    draw();

    let raf = 0;
    const rafLoop = () => {
      draw();
      raf = requestAnimationFrame(rafLoop);
    };
    raf = requestAnimationFrame(rafLoop);

    return () => {
      worker.terminate();
      URL.revokeObjectURL(url);
      cancelAnimationFrame(raf);
    };
  }, [running]);

  /**
   * Increment today's totalSecondsFocusedToday by exactly the number of new
   * stopwatch-seconds since the last flush. Runs only when the timer is
   * actively running; freezes instantly on pause.
   */
  const flushSession = () => {
    if (!runningRef.current) return;
    const total = Math.floor(
      (accumulatedMsRef.current +
        (startedAtEpochRef.current
          ? Date.now() - startedAtEpochRef.current
          : 0)) /
        1000,
    );
    const delta = total - lastCountedSecondsRef.current;
    if (delta > 0) {
      addSecondsToToday(delta);
      lastCountedSecondsRef.current = total;
      setLogVersion((v) => v + 1);
    }
  };

  // Tick the chart once per second while the stopwatch is running.
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      if (!runningRef.current) return;
      flushSession();
    }, 1000);
    return () => window.clearInterval(id);
  }, [running]);

  const start = () => {
    if (startedAtEpochRef.current == null) startedAtEpochRef.current = Date.now();
    setRunning(true);
    // Keep the PiP <video> paused-state mirrored to the timer state so the
    // mini-window's Play/Pause button reflects reality.
    const v = videoRef.current;
    if (v && v.paused) { v.play().catch(() => {}); }
  };
  const pause = () => {
    if (startedAtEpochRef.current != null) {
      accumulatedMsRef.current += Date.now() - startedAtEpochRef.current;
      startedAtEpochRef.current = null;
    }
    flushSession();
    setRunning(false);
    const v = videoRef.current;
    if (v && !v.paused) { v.pause(); }
  };
  const reset = () => {
    if (startedAtEpochRef.current != null) {
      accumulatedMsRef.current += Date.now() - startedAtEpochRef.current;
      startedAtEpochRef.current = null;
    }
    flushSession();
    setRunning(false);
    accumulatedMsRef.current = 0;
    lastCountedSecondsRef.current = 0;
    setSeconds(0);
    clearState();
  };

  // Stable refs so MediaSession handlers registered on the PiP video never
  // capture stale callbacks after re-renders.
  const startRef = useRef(start);
  const pauseRef = useRef(pause);
  useEffect(() => {
    startRef.current = start;
    pauseRef.current = pause;
  });

  // --- Media Session action handlers so PiP window shows play/pause controls ---
  // Registered ONCE; handlers call the ref so they always see fresh state.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.setActionHandler("play", () => startRef.current());
      navigator.mediaSession.setActionHandler("pause", () => pauseRef.current());
      navigator.mediaSession.setActionHandler("stop", () => pauseRef.current());
    } catch { /* noop */ }
    return () => {
      try {
        navigator.mediaSession.setActionHandler("play", null);
        navigator.mediaSession.setActionHandler("pause", null);
        navigator.mediaSession.setActionHandler("stop", null);
      } catch { /* noop */ }
    };
  }, []);

  // Keep metadata + playbackState in sync with `running` for the PiP overlay UI.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: running ? "Focus session — LIVE" : "Focus session — paused",
        artist: "From The Last Bench",
        album: "Deep Work Stopwatch",
      });
      navigator.mediaSession.playbackState = running ? "playing" : "paused";
    } catch { /* noop */ }
  }, [running]);

  const enterPiP = async () => {
    try {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return;
      if (!("pictureInPictureEnabled" in document)) {
        alert("Picture-in-Picture is not supported in this browser.");
        return;
      }
      const stream = canvas.captureStream(30);
      // Add a silent audio track so MediaSession play/pause action buttons
      // surface on the PiP mini-window (browsers require an audio track).
      try {
        const AC: typeof AudioContext | undefined =
          window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AC) {
          const ac = new AC();
          const dest = ac.createMediaStreamDestination();
          const osc = ac.createOscillator();
          const gain = ac.createGain();
          gain.gain.value = 0.0001; // effectively silent
          osc.connect(gain).connect(dest);
          osc.start();
          dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
        }
      } catch { /* noop */ }
      streamRef.current = stream;
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      await video.requestPictureInPicture();
      setPipActive(true);

      // Try to wire native PiP overlay buttons via the Document PiP / MediaSession bridge.
      try {
        // documentPictureInPicture is emerging; when present it supports rich controls.
        // Fallback: MediaSession play/pause already registered above surfaces on many browsers.
        if (navigator.mediaSession) {
          navigator.mediaSession.playbackState = running ? "playing" : "paused";
        }
      } catch {
        /* noop */
      }
    } catch (err) {
      console.error("PiP failed", err);
    }
  };

  const exitPiP = async () => {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      }
    } catch {
      /* noop */
    }
    setPipActive(false);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onLeave = () => setPipActive(false);
    // Native PiP controls dispatch play/pause on the underlying <video>. Bridge
    // those to our stopwatch so the mini-window Play button reliably resumes.
    const onPlay = () => { if (!runningRef.current) startRef.current(); };
    const onPause = () => { if (runningRef.current) pauseRef.current(); };
    video.addEventListener("leavepictureinpicture", onLeave);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    return () => {
      video.removeEventListener("leavepictureinpicture", onLeave);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
    };
  }, []);

  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && running && !pipActive) {
        pause();
        if (penaltyTimerRef.current) window.clearTimeout(penaltyTimerRef.current);
        penaltyTimerRef.current = window.setTimeout(() => {
          const body =
            "While you are out here wasting your time, someone else is studying and getting ahead of you. GET BACK TO WORK!";
          try {
            if (
              typeof Notification !== "undefined" &&
              Notification.permission === "granted"
            ) {
              new Notification("Focus Broken", { body, tag: "ftlb-focus-penalty" });
            }
          } catch {
            /* noop */
          }
        }, PENALTY_MS);
      } else if (!document.hidden && penaltyTimerRef.current) {
        window.clearTimeout(penaltyTimerRef.current);
        penaltyTimerRef.current = null;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (penaltyTimerRef.current) window.clearTimeout(penaltyTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, pipActive]);

  // --- Chart data: last 7 days. Value = totalSecondsFocusedToday / 60 (minutes) ---
  const chartData = useMemo(() => {
    void logVersion;
    void seconds; // re-render as timer ticks
    const daily = loadDaily();
    const days: { day: string; minutes: number; date: string }[] = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const secs = daily[key] ?? 0;
      days.push({
        day: d.toLocaleDateString(undefined, { weekday: "short" }),
        date: key,
        minutes: Math.round((secs / 60) * 100) / 100,
      });
    }
    return days;
  }, [logVersion, seconds]);

  const avgHours = useMemo(() => {
    const totalMin = chartData.reduce((s, d) => s + d.minutes, 0);
    return totalMin / 60 / 7;
  }, [chartData]);

  const yAxis = useMemo(() => {
    const maxMinutes = chartData.reduce((m, d) => Math.max(m, d.minutes), 0);
    // Below 60 minutes → display minutes.
    if (maxMinutes < 60) {
      const maxMin = Math.max(5, Math.ceil(Math.max(maxMinutes, 1) / 5) * 5);
      const step = maxMin / 4;
      const ticks = [0, step, step * 2, step * 3, maxMin];
      return {
        domain: [0, maxMin] as [number, number],
        ticks,
        format: (v: number) => `${Math.round(v)}m`,
        toValue: (minutes: number) => minutes,
      };
    }
    // Above 60 minutes → display hours.
    const maxHours = Math.max(2, Math.ceil(maxMinutes / 60));
    const ticks: number[] = [];
    for (let i = 0; i <= maxHours; i++) ticks.push(i * 60);
    return {
      domain: [0, maxHours * 60] as [number, number],
      ticks,
      format: (v: number) => `${Math.round(v / 60)}h`,
      toValue: (minutes: number) => minutes,
    };
  }, [chartData]);

  const chartRows = useMemo(
    () => chartData.map((d) => ({ ...d, value: yAxis.toValue(d.minutes) })),
    [chartData, yAxis],
  );

  const { h, m, s } = formatHMS(seconds);

  return (
    <div className="flex flex-col gap-6 px-5 pt-4 pb-6">
      <header className="flex items-center gap-3">
        <Link
          to="/discipline"
          aria-label="Back"
          className="grid h-10 w-10 place-items-center rounded-full bg-card ring-1 ring-border"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent-amber">
            Discipline · Section C
          </p>
          <h1 className="truncate text-xl">Focus Analytics Tracker</h1>
        </div>
      </header>

      <section className="relative overflow-hidden rounded-3xl border border-border bg-card p-5 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-accent-amber">
            <TimerIcon className="h-4 w-4" />
            <span className="text-[10px] font-bold uppercase tracking-[0.18em]">
              Deep Work Stopwatch
            </span>
          </div>
          <button
            onClick={pipActive ? exitPiP : enterPiP}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1.5 text-xs font-semibold text-primary ring-1 ring-primary/30 transition hover:bg-primary/25"
            aria-label="Float Timer"
          >
            <PictureInPicture2 className="h-4 w-4" />
            {pipActive ? "Close Float" : "Float Timer"}
          </button>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-2 text-center">
          {[
            { label: "HRS", val: h },
            { label: "MIN", val: m },
            { label: "SEC", val: s },
          ].map((u) => (
            <div
              key={u.label}
              className="rounded-2xl bg-background/60 py-4 ring-1 ring-border"
            >
              <div className="font-mono text-4xl font-bold tabular-nums">
                {u.val}
              </div>
              <div className="mt-1 text-[10px] font-semibold tracking-[0.2em] text-muted-foreground">
                {u.label}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          {!running ? (
            <button
              onClick={start}
              className="col-span-2 inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-primary to-primary/80 px-4 py-3 text-sm font-bold text-primary-foreground shadow-md active:scale-[0.98]"
            >
              <Play className="h-4 w-4 fill-current" /> Start
            </button>
          ) : (
            <button
              onClick={pause}
              className="col-span-2 inline-flex items-center justify-center gap-2 rounded-2xl bg-accent-amber px-4 py-3 text-sm font-bold text-accent-amber-foreground shadow-md active:scale-[0.98]"
            >
              <Pause className="h-4 w-4 fill-current" /> Pause
            </button>
          )}
          <button
            onClick={reset}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-card px-4 py-3 text-sm font-semibold ring-1 ring-border active:scale-[0.98]"
          >
            <RotateCcw className="h-4 w-4" /> Reset
          </button>
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          Timer state is auto-saved — reload the tab and your session resumes exactly where it left off.
          Leaving the app without <span className="font-semibold text-foreground">Float Timer</span> pauses your session.
        </p>

        <canvas
          ref={canvasRef}
          width={480}
          height={220}
          className="hidden"
          aria-hidden
        />
        <video
          ref={videoRef}
          playsInline
          muted
          className="hidden"
          aria-hidden
        />
      </section>

      <section className="rounded-3xl border border-border bg-card p-5">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-accent-amber">
              Weekly Focus
            </p>
            <h2 className="mt-1 text-lg font-bold">Last 7 Days</h2>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Avg / Day
            </p>
            <p className="font-mono text-2xl font-bold text-primary">
              {avgHours.toFixed(2)}
              <span className="ml-1 text-xs font-medium text-muted-foreground">
                hrs
              </span>
            </p>
          </div>
        </div>

        <div className="mt-4 h-52 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartRows} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="focusBar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.35} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="day"
                stroke="var(--muted-foreground)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="var(--muted-foreground)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={44}
                domain={yAxis.domain}
                ticks={yAxis.ticks}
                allowDecimals={false}
                tickFormatter={yAxis.format}
                interval={0}
              />
              <Tooltip
                cursor={{ fill: "color-mix(in oklab, var(--muted) 30%, transparent)" }}
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  fontSize: 12,
                }}
                formatter={(v: number) => [yAxis.format(v as number), "Focus"]}
              />
              <Bar dataKey="value" fill="url(#focusBar)" radius={[8, 8, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
