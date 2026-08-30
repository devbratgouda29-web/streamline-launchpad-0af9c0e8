import { useEffect, useState } from "react";
import { Pause, Play, Sparkles, Timer } from "lucide-react";
import {
  getSession,
  setPlaying,
  setRemaining,
  subscribe as subscribeSession,
  type RecallSession,
} from "@/lib/recall-session";

function format(ms: number) {
  if (ms <= 0) return "00:00";
  const s = Math.floor(ms / 1000);
  const m = String(Math.floor(s / 60)).padStart(2, "0");
  const r = String(s % 60).padStart(2, "0");
  return `${m}:${r}`;
}

/**
 * Floating recall timer badge for the PDF Reader.
 * Ticks locally while playing AND mounted. At 00:00 (or when devpass fires)
 * the pill morphs into a glowing "CLAIM REWARD" button that invokes onClaim.
 */
export function RecallTimerBadge({
  sourceId,
  onClaim,
}: {
  sourceId: string;
  onClaim?: () => void;
}) {
  const [session, setSession] = useState<RecallSession | null>(() => getSession());

  useEffect(() => {
    setSession(getSession());
    const unsub = subscribeSession((s) => setSession(s));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!session || session.sourceId !== sourceId) return;
    if (!session.playing) return;
    if (session.remainingMs <= 0) return;
    let last = Date.now();
    const iv = window.setInterval(() => {
      const now = Date.now();
      const dt = now - last;
      last = now;
      const cur = getSession();
      if (!cur || cur.sourceId !== sourceId || !cur.playing) return;
      const next = Math.max(0, cur.remainingMs - dt);
      setRemaining(next);
      if (next <= 0) setPlaying(false);
    }, 250);
    return () => window.clearInterval(iv);
  }, [session?.playing, session?.sourceId, sourceId, session?.remainingMs === 0]);

  if (!session || session.sourceId !== sourceId) return null;

  const isDebt = session.isDebt;
  const playing = session.playing;
  const remaining = session.remainingMs;
  const done = remaining <= 0 || session.completed;
  const pct = Math.min(
    100,
    ((session.durationMs - remaining) / Math.max(1, session.durationMs)) * 100,
  );

  if (done) {
    return (
      <button
        type="button"
        onClick={onClaim}
        className="pointer-events-auto inline-flex animate-pulse items-center gap-1.5 rounded-full border-2 border-amber-300 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400 px-3.5 py-1.5 text-[11px] font-black uppercase tracking-[0.2em] text-black shadow-[0_0_24px_rgba(251,191,36,0.85)] hover:brightness-110"
      >
        <Sparkles className="h-3.5 w-3.5" />
        Claim Reward
      </button>
    );
  }

  const chip = isDebt
    ? "border-red-500/60 bg-red-500/20 text-red-100"
    : "border-purple-400/60 bg-purple-500/25 text-purple-50";
  const bar = isDebt ? "bg-red-500" : "bg-gradient-to-r from-purple-400 to-fuchsia-500";
  const btnBg = isDebt
    ? "bg-red-500 text-white hover:bg-red-400"
    : "bg-purple-500 text-white hover:bg-purple-400";

  return (
    <div
      className={`pointer-events-auto flex items-center gap-2 rounded-full border ${chip} px-2.5 py-1.5 shadow-lg backdrop-blur`}
      role="group"
      aria-label="Recall timer"
    >
      <div className="flex items-center gap-1.5 pl-1 pr-0.5">
        <Timer className="h-3.5 w-3.5" />
        <span className="font-mono text-xs font-bold tabular-nums leading-none">
          {format(remaining)}
        </span>
      </div>
      <div className="relative h-1.5 w-16 overflow-hidden rounded-full bg-black/40">
        <div className={`h-full ${bar}`} style={{ width: `${pct}%` }} />
      </div>
      <button
        type="button"
        onClick={() => setPlaying(!playing)}
        disabled={remaining <= 0}
        aria-label={playing ? "Pause recall timer" : "Play recall timer"}
        className={`grid h-7 w-7 place-items-center rounded-full ${btnBg} disabled:opacity-40`}
      >
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}
