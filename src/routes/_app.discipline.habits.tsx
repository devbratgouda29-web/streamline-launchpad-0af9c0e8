import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Plus,
  Flame,
  Quote,
  Shield,
  Trophy,
  X,
  Lock,
  AlertTriangle,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { RankShieldFrame } from "@/components/RankShield";
import { useAuth } from "@/hooks/use-auth";
import { RankUpCelebration } from "@/components/RankUpCelebration";

export const Route = createFileRoute("/_app/discipline/habits")({
  head: () => ({
    meta: [
      { title: "Habit RPG Tracker — Discipline Hub" },
      {
        name: "description",
        content:
          "Autonomous 24-hour habit clocks. Streaks climb by themselves; relapse resets you to Level 1.",
      },
    ],
  }),
  component: HabitTrackerPage,
});

// ---------- Milestone rank system ----------
type Milestone = {
  level: number;
  streak: number;
  name: string;
  shield: string;
  titleImg: string;
  desc: string;
};

const habitMilestones: Milestone[] = [
  { level: 1, streak: 1, name: "A HERO REBORN", shield: "shield_1.png", titleImg: "title_1.png", desc: "The humble beginning, where the journey of transformation first sparks from the ashes of old habits. You have made the single hardest decision — to begin again. Every legend, every master, every architect of their own destiny once stood exactly where you stand now: at Day One, with nothing but a fragile promise and the quiet courage to keep it." },
  { level: 2, streak: 3, name: "SCRAP IRON SURVIVOR", shield: "shield_2.png", titleImg: "title_2.png", desc: "The stage of raw resilience, where you piece together your new routine out of sheer willpower and stubborn determination. Nothing is polished, nothing is pretty — but every action you take is a rivet hammered into the armor of your future self. The old you tried to pull you back; you survived, and that survival is now welded permanently into your identity." },
  { level: 3, streak: 7, name: "THE MECHANIZED REBEL", shield: "shield_3.png", titleImg: "title_3.png", desc: "Your dedication becomes consistent and your habits begin to operate with the precision of a well-oiled machine. A full week of unbroken discipline proves this is no longer a mood or a motivation spike — it is a system. You are rebelling against the average, against comfort, against the lazy version of yourself, and the gears of a new life have started turning on their own." },
  { level: 4, streak: 15, name: "BRONZE LION-HEART", shield: "shield_4.png", titleImg: "title_4.png", desc: "Awaken the prestigious lion within — courage forged from raw survival and quiet, daily bravery. Two weeks in, fear no longer commands you. You have felt the pull of the old life and roared back louder. Your heart is now cast in bronze: heavier than it was, warmer to those who deserve it, and impossible to intimidate by the small voices of doubt." },
  { level: 5, streak: 30, name: "SILVER SENTINEL", shield: "shield_5.png", titleImg: "title_5.png", desc: "You now guard your own progress with cool, calculated clarity — disciplined, unwavering, and impossible to ambush. A full month of consistency has sharpened your instincts. You spot temptations before they arrive, you defend your schedule like sacred ground, and you understand that true strength is not loud — it is a silent sentinel standing watch over the person you are becoming." },
  { level: 6, streak: 45, name: "GILDED VANGUARD", shield: "shield_6.png", titleImg: "title_6.png", desc: "A hero who has seen real battle and still stands tall, wearing the scars of progress like ornaments of gold. You lead from the front now. Others quietly watch how you carry yourself, how you refuse to break the streak, how you move first when everyone else hesitates. The gilding on your armor is not vanity — it is proof that consistency, over time, becomes beautiful." },
  { level: 7, streak: 60, name: "SILVER LION KNIGHT", shield: "shield_7.png", titleImg: "title_7.png", desc: "The active guardian of your mission, standing ready at all times, sword drawn against complacency. Two months of unbroken commitment have knighted you. Your roar is measured, your strike is precise, and your loyalty to your future self is absolute. You no longer chase discipline — you embody it, and you protect it in others simply by existing." },
  { level: 8, streak: 90, name: "GOLD KNIGHT OF FORTITUDE", shield: "shield_8.png", titleImg: "title_8.png", desc: "An unbreakable sentinel — the habit is no longer something you do, it is a core part of who you are. Ninety days of fortitude have alchemized effort into identity. Pressure that once shattered you now polishes you. You have crossed the invisible threshold where willpower quietly retires and character takes the throne, wearing gold that was earned, not gifted." },
  { level: 9, streak: 120, name: "DRAGON FIRE CHAMPION", shield: "shield_9.png", titleImg: "title_9.png", desc: "Mastery of your own internal narrative — immense power fused with an untamed, focused willpower. Four months in, the fire inside you no longer flickers with the weather of your moods. You breathe discipline like a dragon breathes flame: on command, with control, and with a heat that burns away every excuse before it can even form a shape." },
  { level: 10, streak: 150, name: "DIAMOND-CRESTED SOVEREIGN", shield: "shield_10.png", titleImg: "title_10.png", desc: "A tempered spirit as unbreakable as diamond, formed under years of pressure compressed into months of relentless practice. You now rule your own inner kingdom. Distractions bow, cravings kneel, and the crown on your head was cut from the hardest material in existence — proof that a soul refined by discipline cannot be scratched by circumstance." },
  { level: 11, streak: 180, name: "APEX PLATINUM DRAKE", shield: "shield_11.png", titleImg: "title_11.png", desc: "The evolution of a disciplined warrior into a true force of nature, rare and refined. Half a year of unbroken commitment has transmuted you into something few ever become: platinum-forged, apex-tier, and calmly aware of your own quiet power. You no longer prove yourself to the world — the world quietly rearranges itself around your consistency." },
  { level: 12, streak: 210, name: "STORM-FORCED THUNDERLORD", shield: "shield_12.png", titleImg: "title_12.png", desc: "A singular, thunderous will that dominates every obstacle placed in its path. Seven months deep, your presence changes the weather of any room you enter. Chaos, distraction, and self-doubt scatter like startled birds. Every action you take now lands with the weight of accumulated lightning — earned, stored, and released with terrifying precision." },
  { level: 13, streak: 240, name: "SILVER SCHOLAR OF THE LAST BENCH", shield: "shield_13.png", titleImg: "title_13.png", desc: "Where the path of the warrior finally meets the wisdom of the sage. Eight months of discipline have taught you what no book ever could: that the deepest strength is quiet, patient, and endlessly curious. From the back bench — the humblest seat in the room — you now see the entire game more clearly than those seated at the front." },
  { level: 14, streak: 300, name: "GOLD SAGE OF THE LAST BENCH", shield: "shield_14.png", titleImg: "title_14.png", desc: "Obsessed with the everyday process — discipline has been refined into a personal art form. Ten months in, you no longer chase outcomes; you fall in love with the reps, the rituals, the small sacred motions that compound into greatness. Your wisdom is golden precisely because it was mined slowly, one honest day at a time, from the deepest quarries of consistency." },
  { level: 15, streak: 365, name: "CELESTIAL ARCHITECT OF THE LAST BENCH", shield: "shield_15.png", titleImg: "title_15.png", desc: "Sovereign of the Eternal Bench, shaping reality among the stars. A full year of unbroken discipline has elevated you beyond habit, beyond identity, into architecture — you now design the very structure of your days, your mind, and your legacy. From the last bench of a forgotten classroom, you have built a throne that touches the heavens, and the constellations themselves take notes from your example." },
];

function milestoneFor(streak: number): Milestone {
  let current = habitMilestones[0];
  for (const m of habitMilestones) {
    if (streak >= m.streak) current = m;
    else break;
  }
  return current;
}
function nextMilestone(streak: number): Milestone | null {
  for (const m of habitMilestones) if (streak < m.streak) return m;
  return null;
}

// ---------- Quotes ----------
const quotes: string[] = [
  "The last bench isn't a seating arrangement; it's a mindset. Prove them wrong.",
  "Your excuses sound best to the mind that is making them up. Stop listening.",
  "I know recovery is hard but believe me regret is even harder. So choose wisely.",
  "Don't stop when you're tired. Stop when you are done.",
  "Regret of neglected opportunity is the worst hell a living soul can inhabit.",
  "An amateur waits for motivation. A last-bench legend relies on absolute discipline.",
  "When you feel like quitting, remember why you started this grueling journey.",
  "Comfort is the silent killer of all your grand potential. Choose the struggle.",
  "Every drop of sweat today saves a tear of regret when results are announced.",
  "You've failed a thousand times before. Get back up and try one more time.",
  "Your alarm doesn't care how tired you are. Get out of bed and execute.",
  "Don't let your weak, quitting mind cheat you out of another victorious day.",
  "They expect you to fail. Disappoint them with your relentless work ethic.",
  "The textbook doesn't read itself. Flip the page and finish the chapter now.",
  "Small daily wins stack up to massive victories over 365 days. Keep pushing.",
  "Pain is temporary. A terrible rank card lasts forever. Choose your struggle wisely.",
  "No one is coming to save you. You have to climb out of this hole yourself.",
  "Your competition is studying right now while you scroll. Wake up.",
  "Consistency beats raw talent every single day of the week. Stay on it.",
  "Be obsessed with your personal growth, or stay completely ordinary.",
  "The secret of getting ahead is simply starting. Focus on the next 10 minutes.",
  "Legends aren't born in the spotlight; they are forged in the quiet dark.",
  "If it were easy, everyone would do it. That is why it belongs to you.",
  "Your future self is either thanking you or cursing you right now.",
  "Stop talking about what you want to do, and start showing the results.",
  "Discipline means doing what needs to be done, even when you hate it.",
  "You don't need a perfect plan; you just need to work harder than yesterday.",
  "The hours you put in when no one is watching are the ones that define you.",
  "Break the bad habits before they completely break your life goals.",
  "Another day is ending. Will you count this as a massive win or a lazy loss?",
  "No excuses, no shortcuts, no compromises. Just pure, unadulterated execution.",
  "The only bad study session is the one that you completely skipped.",
  "Suffer the pain of discipline today, or suffer the pain of regret tomorrow.",
  "They mock the backbenchers until the backbenchers clear the toughest exams.",
  "You are entirely capable of changing your life trajectory starting this second.",
  "Every temptation you resist builds another layer of your sovereign shield.",
  "Your mind will give up a thousand times before your body actually does. Override it.",
  "Success isn't given; it is earned on the battlefield of daily repetition.",
  "Focus on the process, not the mountain. Just win the current hour.",
  "Sleep is sweet, but ultimate victory is sweeter. Throw off the blanket.",
];

function pickQuote(prev?: string) {
  if (quotes.length <= 1) return quotes[0];
  let q = quotes[Math.floor(Math.random() * quotes.length)];
  let tries = 0;
  while (q === prev && tries++ < 6) q = quotes[Math.floor(Math.random() * quotes.length)];
  return q;
}

// ---------- Habit model ----------
const DAY_MS = 24 * 60 * 60 * 1000;

type Relapse = { ts: number; reason: string };
type Habit = {
  id: string;
  name: string;
  emoji: string;
  startTs: number; // start of current 24h cycle
  streak: number;
  relapses: Relapse[];
};

const STORAGE_KEY = "ftlb.habits.v2";

function defaultHabits(): Habit[] {
  const now = Date.now();
  return [
    { id: "h1", name: "No Netflix", emoji: "🚫", startTs: now - 6 * 60 * 60 * 1000, streak: 12, relapses: [] },
    { id: "h2", name: "Wake up at 5 AM", emoji: "⏰", startTs: now - 2 * 60 * 60 * 1000, streak: 4, relapses: [] },
  ];
}

function loadHabits(): Habit[] {
  if (typeof window === "undefined") return defaultHabits();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultHabits();
    const parsed = JSON.parse(raw) as Habit[];
    if (!Array.isArray(parsed) || parsed.length === 0) return defaultHabits();
    return parsed;
  } catch {
    return defaultHabits();
  }
}

function rollCycles(h: Habit, now: number): Habit {
  const elapsed = now - h.startTs;
  if (elapsed < DAY_MS) return h;
  const days = Math.floor(elapsed / DAY_MS);
  return { ...h, streak: h.streak + days, startTs: h.startTs + days * DAY_MS };
}

// ---------- Page ----------
type View = "clock" | "rank";

function HabitTrackerPage() {
  const { requireAuth } = useAuth();
  const [habits, setHabits] = useState<Habit[]>(() => defaultHabits());
  const [activeId, setActiveId] = useState<string>("");
  const [view, setView] = useState<View>("clock");
  const [now, setNow] = useState<number>(() => Date.now());
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState("🔥");
  const [relapseFor, setRelapseFor] = useState<string | null>(null);
  const [selectedRank, setSelectedRank] = useState<Milestone | null>(null);

  // Quote is static per view/tab. Only re-picks on active tab change or view change.
  const [quote, setQuote] = useState<string>(() => pickQuote());
  const prevQuoteRef = useRef<string>(quote);

  // hydrate from storage
  useEffect(() => {
    const loaded = loadHabits();
    setHabits(loaded);
    setActiveId(loaded[0]?.id ?? "");
  }, []);

  // persist
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(habits));
    } catch {
      // ignore
    }
  }, [habits]);

  // autonomous clock tick
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // auto-roll cycles when time crosses 24h boundary
  useEffect(() => {
    setHabits((prev) => {
      let changed = false;
      const next = prev.map((h) => {
        const rolled = rollCycles(h, now);
        if (rolled !== h) changed = true;
        return rolled;
      });
      return changed ? next : prev;
    });
  }, [now]);

  // Re-pick quote only when active habit or view changes (never on interval)
  useEffect(() => {
    const q = pickQuote(prevQuoteRef.current);
    prevQuoteRef.current = q;
    setQuote(q);
  }, [activeId, view]);

  const active = useMemo(
    () => habits.find((h) => h.id === activeId) ?? habits[0],
    [habits, activeId],
  );

  // ---------- Rank-up celebration ----------
  const [celebration, setCelebration] = useState<Milestone | null>(null);
  const prevLevelsRef = useRef<Record<string, number>>({});
  useEffect(() => {
    for (const h of habits) {
      const lvl = milestoneFor(h.streak).level;
      const prev = prevLevelsRef.current[h.id];
      if (prev !== undefined && lvl > prev) {
        const m = milestoneFor(h.streak);
        setCelebration(m);
        toast.success("RANK UP! You have unlocked a new tier emblem.", {
          description: `${m.name} · Level ${m.level}`,
        });
      }
      prevLevelsRef.current[h.id] = lvl;
    }
  }, [habits]);

  const addHabit = () => {
    if (!requireAuth("habit")) return;
    const name = newName.trim();
    if (!name) return;
    const h: Habit = {
      id: `h${Date.now()}`,
      name,
      emoji: newEmoji || "🔥",
      startTs: Date.now(),
      streak: 0,
      relapses: [],
    };
    setHabits((p) => [...p, h]);
    setActiveId(h.id);
    setNewName("");
    setNewEmoji("🔥");
    setAdding(false);
  };

  const removeHabit = (id: string) => {
    setHabits((prev) => {
      const filtered = prev.filter((h) => h.id !== id);
      if (activeId === id) setActiveId(filtered[0]?.id ?? "");
      return filtered;
    });
  };

  const confirmRelapse = (reason: string) => {
    if (!requireAuth("habit")) return;
    if (!relapseFor) return;
    setHabits((prev) =>
      prev.map((h) =>
        h.id === relapseFor
          ? {
              ...h,
              streak: 0,
              startTs: Date.now(),
              relapses: [{ ts: Date.now(), reason: reason.trim() || "—" }, ...h.relapses],
            }
          : h,
      ),
    );
    setRelapseFor(null);
  };

  if (!active) {
    return (
      <div className="flex flex-col gap-6 px-5 pt-4 pb-8">
        <HeaderBar onAdd={() => setAdding(true)} />
        {adding && (
          <AddHabitForm
            name={newName}
            emoji={newEmoji}
            onName={setNewName}
            onEmoji={setNewEmoji}
            onAdd={addHabit}
            onCancel={() => setAdding(false)}
          />
        )}
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No clocks yet. Tap <span className="text-primary">+</span> to forge your first habit clock.
        </div>
      </div>
    );
  }

  const activeMilestone = milestoneFor(active.streak);
  const activeNext = nextMilestone(active.streak);

  return (
    <div className="flex flex-col gap-5 px-5 pt-4 pb-8">
      <HeaderBar onAdd={() => setAdding(true)} />

      {/* Prominent current rank shield frame */}
      <RankShieldFrame
        level={activeMilestone.level}
        rankName={activeMilestone.name}
        streak={active.streak}
        nextStreak={activeNext ? activeNext.streak : null}
        nextRankName={activeNext ? activeNext.name : null}
      />

      {adding && (
        <AddHabitForm
          name={newName}
          emoji={newEmoji}
          onName={setNewName}
          onEmoji={setNewEmoji}
          onAdd={addHabit}
          onCancel={() => setAdding(false)}
        />
      )}

      {/* Habit tabs */}
      <HabitTabs
        habits={habits}
        activeId={active.id}
        onSelect={(id) => {
          setActiveId(id);
          setView("clock");
        }}
      />

      {/* View switch */}
      <div className="flex items-center gap-2 rounded-full border border-border bg-card p-1">
        <SwitchButton active={view === "clock"} onClick={() => setView("clock")} icon={<Flame className="h-3.5 w-3.5" />}>
          Clock
        </SwitchButton>
        <SwitchButton active={view === "rank"} onClick={() => setView("rank")} icon={<Trophy className="h-3.5 w-3.5" />}>
          My Rank
        </SwitchButton>
      </div>

      {view === "clock" ? (
        <ClockView
          habit={active}
          now={now}
          quote={quote}
          onRelapse={() => setRelapseFor(active.id)}
          onDelete={() => removeHabit(active.id)}
        />
      ) : (
        <RankColumnView currentStreak={active.streak} onSelectRank={setSelectedRank} />
      )}

      {relapseFor && (
        <RelapseModal
          habitName={habits.find((h) => h.id === relapseFor)?.name ?? ""}
          onCancel={() => setRelapseFor(null)}
          onConfirm={confirmRelapse}
        />
      )}

      {selectedRank && (
        <RankModal
          milestone={selectedRank}
          currentStreak={active.streak}
          onClose={() => setSelectedRank(null)}
        />
      )}
      {celebration && (
        <RankUpCelebration
          level={celebration.level}
          rankName={celebration.name}
          onDismiss={() => setCelebration(null)}
        />
      )}
    </div>
  );
}

function HeaderBar({ onAdd }: { onAdd: () => void }) {
  return (
    <header className="flex items-center gap-3">
      <Link
        to="/discipline"
        className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground"
        aria-label="Back to Discipline Hub"
      >
        <ArrowLeft className="h-4 w-4" />
      </Link>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent-amber">
          Discipline · Section A
        </p>
        <h1 className="truncate text-2xl leading-tight">Autonomous Streak Engine</h1>
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30"
        aria-label="Add habit clock"
      >
        <Plus className="h-4 w-4" />
      </button>
    </header>
  );
}

function AddHabitForm({
  name,
  emoji,
  onName,
  onEmoji,
  onAdd,
  onCancel,
}: {
  name: string;
  emoji: string;
  onName: (v: string) => void;
  onEmoji: (v: string) => void;
  onAdd: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-3">
      <input
        value={emoji}
        onChange={(e) => onEmoji(e.target.value.slice(0, 2))}
        className="w-11 shrink-0 rounded-lg bg-secondary px-2 py-2 text-center text-lg outline-none"
        aria-label="Emoji"
      />
      <input
        autoFocus
        value={name}
        onChange={(e) => onName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onAdd()}
        placeholder="New clock (e.g. No Netflix)"
        className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
      <button onClick={onAdd} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground">
        Add
      </button>
      <button onClick={onCancel} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-secondary">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function HabitTabs({
  habits,
  activeId,
  onSelect,
}: {
  habits: Habit[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <div className="flex gap-2">
        {habits.map((h) => {
          const isActive = h.id === activeId;
          return (
            <button
              key={h.id}
              onClick={() => onSelect(h.id)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                isActive
                  ? "border-primary bg-primary/15 text-foreground ring-1 ring-primary/40"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="text-sm leading-none">{h.emoji}</span>
              <span className="max-w-[140px] truncate">{h.name}</span>
              <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-black", isActive ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground/80")}>
                {h.streak}d
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SwitchButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] transition-colors",
        active ? "bg-crimson-gradient text-primary-foreground shadow shadow-primary/30" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

// ---------- Clock view ----------
function ClockView({
  habit,
  now,
  quote,
  onRelapse,
  onDelete,
}: {
  habit: Habit;
  now: number;
  quote: string;
  onRelapse: () => void;
  onDelete: () => void;
}) {
  const milestone = milestoneFor(habit.streak);
  const next = nextMilestone(habit.streak);

  const elapsed = Math.max(0, Math.min(DAY_MS, now - habit.startTs));
  const remainingMs = DAY_MS - elapsed;
  const progress = elapsed / DAY_MS; // 0..1 of current day

  const hh = Math.floor(remainingMs / 3600_000);
  const mm = Math.floor((remainingMs % 3600_000) / 60_000);
  const ss = Math.floor((remainingMs % 60_000) / 1000);
  const clock = `${pad(hh)}:${pad(mm)}:${pad(ss)}`;

  const size = 240;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * progress;

  return (
    <section className="relative overflow-hidden rounded-3xl border border-border bg-card p-5">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-primary/25 blur-3xl"
      />
      <div className="relative flex flex-col items-center gap-4">
        <div className="flex w-full items-center justify-between">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
            <Flame className="h-3 w-3" /> Live Clock
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Lvl {milestone.level} / 15
          </span>
        </div>

        <p className="text-center text-sm font-semibold text-foreground/90">
          {habit.emoji} {habit.name}
        </p>

        {/* Countdown ring */}
        <div className="relative" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="rotate-[-90deg]">
            <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--color-border)" strokeWidth={stroke} fill="none" />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke="var(--color-primary)"
              strokeWidth={stroke}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${c}`}
              style={{ filter: "drop-shadow(0 0 12px oklch(0.42 0.22 27 / 0.6))" }}
            />
          </svg>
          <div className="absolute inset-0 grid place-items-center">
            <div className="flex flex-col items-center">
              <span className="font-mono text-3xl font-black leading-none tracking-tight text-foreground drop-shadow-[0_2px_10px_rgba(0,0,0,0.6)]">
                {clock}
              </span>
              <span className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-accent-amber">
                Next Day In
              </span>
              <span className="mt-3 text-5xl font-black leading-none text-foreground">
                {habit.streak}
              </span>
              <span className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                Day Streak
              </span>
            </div>
          </div>
        </div>

        {/* Side-by-side rank identity: shield + title */}
        <div className="flex w-full items-center justify-center gap-4">
          <RankShieldImg level={milestone.level} unlocked className="h-24 max-h-24 w-auto" />
          <RankTitleImg level={milestone.level} title={milestone.name} unlocked className="h-10 md:h-12 w-full" />
        </div>
        <p className="max-w-sm text-center text-[13px] italic leading-relaxed text-muted-foreground">
          {milestone.desc}
        </p>

        {next ? (
          <div className="w-full">
            <div className="mb-1.5 flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">
                Next: <span className="text-foreground/80 font-semibold">{next.name}</span>
              </span>
              <span className="text-accent-amber font-bold">
                {next.streak - habit.streak}d
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full bg-crimson-gradient"
                style={{
                  width: `${Math.min(100, ((habit.streak - milestone.streak) / Math.max(1, next.streak - milestone.streak)) * 100)}%`,
                }}
              />
            </div>
          </div>
        ) : (
          <div className="w-full rounded-xl border border-accent-amber/40 bg-accent-amber/10 px-3 py-2 text-center text-[11px] font-bold uppercase tracking-[0.16em] text-accent-amber">
            Max Rank Achieved · Sovereign
          </div>
        )}

        {/* Relapse button */}
        <button
          type="button"
          onClick={onRelapse}
          className="mt-1 flex w-full items-center justify-center gap-2 rounded-2xl bg-destructive px-4 py-3 text-sm font-black uppercase tracking-[0.16em] text-destructive-foreground shadow-lg shadow-destructive/40 transition-transform active:scale-[0.98]"
        >
          <AlertTriangle className="h-4 w-4" />
          Relapse — Reset Clock
        </button>

        {/* Quote — static per view */}
        <div className="mt-2 w-full rounded-2xl border border-border bg-background/60 p-4">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-accent-amber">
            <Quote className="h-3 w-3" /> Sovereign Whisper
          </div>
          <p className="text-[13px] italic leading-relaxed text-foreground/90">"{quote}"</p>
        </div>

        {/* Relapse log */}
        {habit.relapses.length > 0 && (
          <details className="w-full rounded-2xl border border-border bg-background/40 p-3">
            <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Relapse Log · {habit.relapses.length}
            </summary>
            <ul className="mt-2 flex flex-col gap-2">
              {habit.relapses.slice(0, 6).map((r, i) => (
                <li key={i} className="rounded-lg border border-border/60 bg-card p-2 text-xs">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-destructive">
                    {new Date(r.ts).toLocaleString()}
                  </p>
                  <p className="mt-0.5 italic text-foreground/80">{r.reason}</p>
                </li>
              ))}
            </ul>
          </details>
        )}

        <button
          onClick={onDelete}
          className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete this clock
        </button>
      </div>
    </section>
  );
}

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

// ---------- Relapse modal ----------
function RelapseModal({
  habitName,
  onCancel,
  onConfirm,
}: {
  habitName: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-5 backdrop-blur-sm">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-destructive/40 bg-card shadow-2xl shadow-destructive/30">
        <div className="flex items-center gap-2 border-b border-border bg-destructive/10 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <p className="flex-1 text-sm font-black uppercase tracking-[0.14em] text-destructive">
            Relapse Confirmed
          </p>
          <button onClick={onCancel} className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-col gap-3 p-4">
          <p className="text-xs text-muted-foreground">
            Habit: <span className="font-semibold text-foreground">{habitName}</span>
          </p>
          <label className="text-[11px] font-bold uppercase tracking-[0.14em] text-foreground/80">
            What caused your relapse?
          </label>
          <textarea
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Enter reason / short note…"
            rows={4}
            className="w-full resize-none rounded-lg border border-border bg-background p-3 text-sm outline-none focus:border-destructive"
          />
          <p className="text-[11px] italic text-muted-foreground">
            Streak returns to 0, clock resets to 24:00:00, rank drops to Level 1.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onCancel}
              className="flex-1 rounded-xl border border-border bg-secondary px-3 py-2 text-xs font-bold text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={() => onConfirm(reason)}
              className="flex-1 rounded-xl bg-destructive px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-destructive-foreground shadow shadow-destructive/40"
            >
              Reset Clock
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- My Rank grid view ----------
function RankColumnView({
  currentStreak,
  onSelectRank,
}: {
  currentStreak: number;
  onSelectRank: (m: Milestone) => void;
}) {
  const current = milestoneFor(currentStreak);
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black uppercase tracking-[0.16em] text-foreground">
          The 15 Ranks
        </h2>
        <span className="text-[11px] text-muted-foreground">
          Current · Lvl {current.level}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {habitMilestones.map((m) => {
          const unlocked = currentStreak >= m.streak;
          const isCurrent = m.level === current.level;
          return (
            <button
              key={m.level}
              type="button"
              onClick={() => onSelectRank(m)}
              className={cn(
                "flex flex-col justify-between items-center h-full overflow-hidden rounded-2xl border px-3 py-4 text-left transition-colors hover:brightness-110",
                isCurrent
                  ? "border-accent-amber bg-accent-amber/10 ring-2 ring-accent-amber shadow-[0_0_24px_-2px_oklch(0.78_0.14_78/0.6)]"
                  : unlocked
                    ? "border-success/30 bg-card"
                    : "border-border bg-card opacity-70",
              )}
            >
              {/* Shield */}
              <div className="relative flex w-full items-center justify-center">
                <RankShieldImg level={m.level} unlocked={unlocked} />
                {!unlocked && (
                  <span className="pointer-events-none absolute inset-0 grid place-items-center">
                    <Lock className="h-5 w-5 text-muted-foreground" />
                  </span>
                )}
              </div>

              {/* Title artwork */}
              <div className="flex w-full flex-col items-center gap-2">
                <RankTitleImg level={m.level} title={m.name} unlocked={unlocked} />

                {/* Level + status */}
                <div className="flex w-full flex-col items-center gap-1.5">
                  <span
                    className={cn(
                      "whitespace-nowrap text-sm font-bold tracking-wider text-zinc-200 mt-1",
                      isCurrent && "text-accent-amber",
                    )}
                  >
                    LVL {m.level} · {m.streak}d
                  </span>
                  {isCurrent ? (
                    <span className="rounded-full bg-accent-amber px-4 py-1 text-xs font-extrabold uppercase tracking-widest text-accent-amber-foreground">
                      You
                    </span>
                  ) : unlocked ? (
                    <span className="rounded-full bg-success/15 px-4 py-1 text-xs font-extrabold uppercase tracking-widest text-success">
                      Unlocked
                    </span>
                  ) : (
                    <span className="rounded-full bg-secondary px-4 py-1 text-xs font-extrabold uppercase tracking-widest text-muted-foreground">
                      Locked
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ---------- Rank detail modal ----------
function RankModal({
  milestone,
  currentStreak,
  onClose,
}: {
  milestone: Milestone;
  currentStreak: number;
  onClose: () => void;
}) {
  const unlocked = currentStreak >= milestone.streak;
  const isCurrent = milestoneFor(currentStreak).level === milestone.level;
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-5 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={cn(
          "relative w-full max-w-sm overflow-hidden rounded-3xl border bg-card px-3 py-4 shadow-2xl",
          isCurrent
            ? "border-accent-amber shadow-accent-amber/20"
            : unlocked
              ? "border-success/30 shadow-success/10"
              : "border-border",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-secondary"
          aria-label="Close rank details"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex flex-col items-center gap-3 text-center">
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em]",
              isCurrent
                ? "bg-accent-amber text-accent-amber-foreground"
                : unlocked
                  ? "bg-success/15 text-success"
                  : "bg-secondary text-muted-foreground",
            )}
          >
            {isCurrent ? "Your Current Rank" : unlocked ? "Unlocked" : "Locked"}
          </span>

          <div className="relative flex w-full items-center justify-center">
            <RankShieldImg level={milestone.level} unlocked={unlocked} />
            {!unlocked && (
              <span className="pointer-events-none absolute inset-0 grid place-items-center">
                <Lock className="h-8 w-8 text-muted-foreground" />
              </span>
            )}
          </div>

          <RankTitleImg
            level={milestone.level}
            title={milestone.name}
            unlocked={unlocked}
          />

          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Lvl {milestone.level} · Required {milestone.streak} days
          </p>

          <p className="w-full text-sm italic leading-relaxed text-foreground/90 whitespace-pre-line">
            {milestone.desc}
          </p>

          {!unlocked && (
            <p className="rounded-xl bg-secondary/50 px-3 py-2 text-[11px] font-semibold text-muted-foreground">
              Unlock in {milestone.streak - currentStreak} day{milestone.streak - currentStreak === 1 ? "" : "s"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Shield / Title image assets with graceful fallbacks ----------
function RankShieldImg({
  level,
  unlocked = true,
  className,
}: {
  level: number;
  unlocked?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div
        className={cn(
          "grid w-48 h-48 md:w-56 md:h-56 place-items-center rounded-xl bg-secondary text-muted-foreground mx-auto",
          !unlocked && "opacity-50 grayscale contrast-125",
          className,
        )}
      >
        <Lock className="h-6 w-6" />
      </div>
    );
  }
  return (
    <img
      src={`/shields/shield-${level}.png`}
      alt={`Level ${level} Shield`}
      onError={() => setFailed(true)}
      loading="lazy"
      decoding="async"
      className={cn(
        "w-48 h-48 md:w-56 md:h-56 object-contain mx-auto drop-shadow-md select-none transition-all",
        !unlocked && "opacity-80 grayscale brightness-[0.55] contrast-110",
        className,
      )}
      draggable={false}
    />

  );
}

function RankTitleImg({
  level,
  title,
  unlocked = true,
  className,
}: {
  level: number;
  title: string;
  unlocked?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span
        className={cn(
          "block w-[88%] h-auto min-h-[40px] mx-auto my-3 truncate text-center text-xs font-black uppercase tracking-wider",
          !unlocked && "opacity-70 grayscale brightness-90",
          className,
        )}
      >
        {title}
      </span>
    );
  }
  return (
    <img
      src={`/shields/title-${level}.png`}
      alt={title}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={cn(
        "w-[88%] h-auto max-h-24 mx-auto object-contain my-3 drop-shadow-md select-none transition-all",
        !unlocked && "opacity-70 grayscale brightness-90",
        className,
      )}
      draggable={false}
    />
  );
}

