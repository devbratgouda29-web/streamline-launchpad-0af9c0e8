import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  AlarmClock,
  Lock,
  Volume2,
  ChevronDown,
  Check,
  Play,
  Pause,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/discipline/alarm")({
  head: () => ({
    meta: [
      { title: "Math-Locked Alarm — Discipline Hub" },
      {
        name: "description",
        content:
          "Un-snoozable morning ignition. Solve to silence — no shortcuts, no snooze, no mercy.",
      },
    ],
  }),
  component: AlarmPage,
});

type Track = { label: string; src: string };

const TRACKS: Track[] = [
  { label: "Coffin Dance Meme Music", src: "/audio/coffin_dance.mp3" },
  { label: "Godzilla's Roar", src: "/audio/godzilla.mp3" },
  { label: "GTA San Andreas Theme", src: "/audio/gta_sa.mp3" },
  { label: "John Cena Entry Theme", src: "/audio/john_cena.mp3" },
  { label: "Man Of Steel", src: "/audio/man_of_steel.mp3" },
  { label: "Mortal Kombat", src: "/audio/mortal_kombat.mp3" },
  { label: "Super Mario Bros.", src: "/audio/super_mario.mp3" },
  { label: "THE BATMAN Theme", src: "/audio/the_batman.mp3" },
  { label: "Transformers Prime", src: "/audio/transformers_prime.mp3" },
  { label: "Transformers", src: "/audio/Transformers.mp3" },
  { label: "Wonder Woman", src: "/audio/wonder_woman.mp3" },
];

const STORAGE_KEY = "ftlb.alarm.v1";

type StoredAlarm = {
  time: string; // HH:MM
  armed: boolean;
  trackSrc: string;
};

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

type Puzzle = { question: string; answer: number };

function makePuzzle(): Puzzle {
  const mode = Math.floor(Math.random() * 3);
  const rand = (min: number, max: number) =>
    min + Math.floor(Math.random() * (max - min + 1));
  if (mode === 0) {
    // triple-digit × single-digit
    const a = rand(120, 899);
    const b = rand(2, 9);
    return { question: `${a} × ${b}`, answer: a * b };
  }
  if (mode === 1) {
    // triple-digit + double-digit
    const a = rand(110, 899);
    const b = rand(11, 99);
    return { question: `${a} + ${b}`, answer: a + b };
  }
  // double-digit − double-digit with borrowing
  let a = rand(30, 99);
  let b = rand(11, 89);
  if (b > a) [a, b] = [b, a];
  // ensure a borrow: units of a < units of b
  if (a % 10 >= b % 10) {
    const shift = (a % 10) + 1;
    b = Math.floor(b / 10) * 10 + Math.min(9, shift);
    if (b > a) b = a - 1;
  }
  return { question: `${a} − ${b}`, answer: a - b };
}

function AlarmPage() {
  const [time, setTime] = useState("06:30");
  const [armed, setArmed] = useState(false);
  const [trackSrc, setTrackSrc] = useState(TRACKS[0].src);
  const [triggered, setTriggered] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const primedRef = useRef(false);
  const lastFireKeyRef = useRef<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const onDown = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [dropdownOpen]);

  // Stop preview when triggered / track changes
  useEffect(() => {
    if (triggered && previewing) {
      const a = audioRef.current;
      if (a) {
        a.pause();
        a.currentTime = 0;
      }
      setPreviewing(false);
    }
  }, [triggered, previewing]);

  const stopPreview = () => {
    const a = audioRef.current;
    if (!a) return;
    a.pause();
    a.currentTime = 0;
    setPreviewing(false);
  };

  const startPreview = () => {
    primeAudio();
    const a = audioRef.current;
    if (!a) return;
    a.src = trackSrc;
    a.loop = false;
    a.volume = 0.8;
    a.currentTime = 0;
    a.play()
      .then(() => setPreviewing(true))
      .catch(() => setPreviewing(false));
  };

  // Restore state
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw) as StoredAlarm;
        if (s.time) setTime(s.time);
        if (typeof s.armed === "boolean") setArmed(s.armed);
        if (s.trackSrc) setTrackSrc(s.trackSrc);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ time, armed, trackSrc } satisfies StoredAlarm),
      );
    } catch {
      /* ignore */
    }
  }, [time, armed, trackSrc]);

  // Tick clock
  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Fire alarm at target minute
  useEffect(() => {
    if (!armed || !now || triggered) return;
    const hhmm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const fireKey = `${now.toDateString()}_${hhmm}`;
    if (hhmm === time && lastFireKeyRef.current !== fireKey) {
      lastFireKeyRef.current = fireKey;
      setTriggered(true);
    }
  }, [now, armed, time, triggered]);

  // Play/loop audio while triggered
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (triggered) {
      audio.src = trackSrc;
      audio.loop = true;
      audio.volume = 1;
      audio.currentTime = 0;
      audio.play().catch(() => {
        /* browser may block; primeAudio should have unlocked */
      });
    } else {
      audio.pause();
      audio.currentTime = 0;
    }
  }, [triggered, trackSrc]);

  const primeAudio = () => {
    const audio = audioRef.current;
    if (!audio || primedRef.current) return;
    // Silent priming play → pause to unlock autoplay policy
    audio.src = trackSrc;
    audio.muted = true;
    audio.play()
      .then(() => {
        audio.pause();
        audio.currentTime = 0;
        audio.muted = false;
        primedRef.current = true;
      })
      .catch(() => {
        audio.muted = false;
      });
  };

  const onArm = (next: boolean) => {
    if (next) primeAudio();
    setArmed(next);
  };

  const onSolved = () => {
    setTriggered(false);
    setArmed(false);
    lastFireKeyRef.current = null;
  };

  const currentTrackLabel = useMemo(
    () => TRACKS.find((t) => t.src === trackSrc)?.label ?? TRACKS[0].label,
    [trackSrc],
  );

  const clockText = now
    ? `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
    : "--:--:--";

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
          <h1 className="text-2xl">Math-Locked Alarm</h1>
        </div>
      </header>

      {/* Live system clock */}
      <div className="rounded-2xl border border-border bg-card p-5 text-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          System time
        </p>
        <p className="mt-1 font-mono text-4xl tabular-nums text-foreground">
          {clockText}
        </p>
      </div>

      <section className="relative rounded-2xl border border-border bg-card p-5">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-1 rounded-l-2xl bg-gradient-to-b from-accent-amber to-accent-amber/40"
        />
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-accent-amber/15 text-accent-amber ring-1 ring-accent-amber/30">
            <AlarmClock className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Ignition target
            </p>
            <h2 className="text-lg font-bold">Set your wake-up time</h2>
          </div>
          <Toggle checked={armed} onChange={onArm} />
        </div>

        <div className="mt-5 flex flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Wake-up time
            </span>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="rounded-xl border border-border bg-background px-4 py-3 font-mono text-2xl tabular-nums text-foreground outline-none focus:border-accent-amber"
            />
          </label>

          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Alarm track
            </span>
            <div ref={dropdownRef} className="relative">
              <button
                type="button"
                onClick={() => setDropdownOpen((o) => !o)}
                aria-haspopup="listbox"
                aria-expanded={dropdownOpen}
                className="flex w-full items-center gap-2 rounded-xl border border-border bg-background py-3 pl-10 pr-10 text-left text-sm text-foreground outline-none focus:border-accent-amber"
              >
                <Volume2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <span className="truncate">{currentTrackLabel}</span>
                <ChevronDown
                  className={cn(
                    "pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-transform",
                    dropdownOpen && "rotate-180",
                  )}
                />
              </button>
              {dropdownOpen && (
                <ul
                  role="listbox"
                  className="absolute left-0 right-0 top-full z-50 mt-2 rounded-xl border border-border bg-card p-1 shadow-2xl"
                >
                  {TRACKS.map((t) => {
                    const active = t.src === trackSrc;
                    return (
                      <li key={t.src}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={active}
                          onClick={() => {
                            if (previewing) stopPreview();
                            setTrackSrc(t.src);
                            setDropdownOpen(false);
                          }}
                          className={cn(
                            "flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                            active
                              ? "bg-accent-amber/15 text-accent-amber"
                              : "text-foreground hover:bg-background",
                          )}
                        >
                          <span className="truncate">{t.label}</span>
                          {active && <Check className="h-4 w-4 shrink-0" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <button
              type="button"
              onClick={previewing ? stopPreview : startPreview}
              className={cn(
                "mt-1 inline-flex items-center gap-2 self-start rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
                previewing
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              {previewing ? (
                <>
                  <Pause className="h-3.5 w-3.5" /> Stop preview
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5" /> Preview track
                </>
              )}
            </button>
          </div>
        </div>

        {armed && (
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Armed for <span className="font-mono text-foreground">{time}</span> ·{" "}
            {currentTrackLabel}
          </p>
        )}
      </section>

      <audio
        ref={audioRef}
        preload="auto"
        onEnded={() => setPreviewing(false)}
      />

      {triggered && <MathLockModal onSolved={onSolved} />}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-7 w-12 shrink-0 rounded-full border transition-colors",
        checked
          ? "border-accent-amber bg-accent-amber/30"
          : "border-border bg-background",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-5 w-5 rounded-full transition-all",
          checked
            ? "left-6 bg-accent-amber shadow-[0_0_12px_-2px_oklch(0.78_0.14_78/0.8)]"
            : "left-0.5 bg-muted-foreground",
        )}
      />
    </button>
  );
}

function MathLockModal({ onSolved }: { onSolved: () => void }) {
  const [puzzle, setPuzzle] = useState<Puzzle>(() => makePuzzle());
  const [value, setValue] = useState("");
  const [wrong, setWrong] = useState(false);

  const submit = () => {
    const n = Number(value.trim());
    if (!Number.isFinite(n)) {
      setWrong(true);
      return;
    }
    if (n === puzzle.answer) {
      onSolved();
    } else {
      setWrong(true);
      setValue("");
      setPuzzle(makePuzzle());
      window.setTimeout(() => setWrong(false), 600);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") e.preventDefault();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm p-5">
      <div
        className={cn(
          "w-full max-w-md rounded-2xl border-2 border-primary bg-card p-6 shadow-[0_0_60px_-10px_oklch(0.42_0.22_27/0.8)]",
          wrong && "animate-pulse",
        )}
      >
        <div className="mb-4 flex items-center gap-2 text-primary">
          <Lock className="h-5 w-5" />
          <p className="text-[11px] font-bold uppercase tracking-[0.18em]">
            Math lock engaged
          </p>
        </div>
        <h2 className="text-2xl font-bold">Solve to silence.</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          No snooze. No mercy. Enter the correct answer to kill the alarm.
        </p>

        <div className="mt-6 rounded-xl border border-border bg-background p-6 text-center font-mono text-3xl tabular-nums">
          {puzzle.question}
        </div>

        <input
          autoFocus
          type="number"
          inputMode="numeric"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="Your answer"
          className={cn(
            "mt-4 w-full rounded-xl border bg-background px-4 py-3 text-center font-mono text-2xl tabular-nums outline-none",
            wrong ? "border-primary" : "border-border focus:border-accent-amber",
          )}
        />

        <button
          type="button"
          onClick={submit}
          className="mt-4 w-full rounded-xl bg-primary py-3 font-bold uppercase tracking-wider text-primary-foreground hover:brightness-110"
        >
          Silence the alarm
        </button>
      </div>
    </div>
  );
}
