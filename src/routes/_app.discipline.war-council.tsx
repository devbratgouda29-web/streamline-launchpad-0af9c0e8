import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  
  Copy,
  Users,
  Send,
  Image as ImageIcon,
  Crown,
  Gavel,
  Trophy,
  X,
  ShieldAlert,
  LogOut,
  UserPlus,
  ClipboardPaste,
  CheckCircle2,
  ArrowLeft,
} from "lucide-react";
import {
  addSimulatedAlly,
  activeDownVotes,
  castExileVote,
  dissolveCouncil,
  forgeCouncil,
  getCouncil,
  getMe,
  joinCouncilByTag,
  leaveCouncil,
  logMockScore,
  MAX_MEMBERS,
  maybeCrownWarlord,
  processAcademicImage,
  sendChat,
  sendImage,
  setMyName,
  setMyUserId,
  subscribeCouncil,
  type Council,
  type Member,
} from "@/lib/council-store";
import { TierShieldSVG } from "@/components/RankShield";
import { WeeklyBadge } from "@/components/WeeklyBadge";
import { useAuth } from "@/hooks/use-auth";
import {
  memberInitials,
  useCouncilAvatars,
  type AvatarMap,
} from "@/hooks/use-council-avatars";
import {
  evaluateWeeklyTier,
  memberWeeklyHours,
} from "@/lib/weekly-badge";
import { getAllItems } from "@/lib/revision-engine";

// Enforced 5-tier core evolution names. Legacy stored values (Iron / Bronze /
// Silver / Gold / Platinum / Diamond) are folded into the canonical set.
const CORE_TIER_ORDER = [
  "BRONZE CORE",
  "IRON CORE",
  "STEEL SENTINEL",
  "TITANIUM WARDEN",
  "PLATINUM CORE",
] as const;
type CoreTierName = (typeof CORE_TIER_ORDER)[number];

const LEGACY_CORE_ALIAS: Record<string, CoreTierName> = {
  Bronze: "BRONZE CORE",
  Iron: "IRON CORE",
  Silver: "STEEL SENTINEL",
  Gold: "TITANIUM WARDEN",
  Platinum: "PLATINUM CORE",
  Diamond: "PLATINUM CORE",
};

function normalizeCoreTier(raw: string): CoreTierName {
  if ((CORE_TIER_ORDER as readonly string[]).includes(raw)) return raw as CoreTierName;
  return LEGACY_CORE_ALIAS[raw] ?? "BRONZE CORE";
}

// Map a canonical core tier to a rank-shield level so badge visuals match
// the Library section palette.
const CORE_TIER_TO_RANK: Record<CoreTierName, number> = {
  "BRONZE CORE": 2,
  "IRON CORE": 5,
  "STEEL SENTINEL": 8,
  "TITANIUM WARDEN": 11,
  "PLATINUM CORE": 15,
};

export const Route = createFileRoute("/_app/discipline/war-council")({
  head: () => ({
    meta: [
      { title: "The War Council — From The Last Bench" },
      {
        name: "description",
        content:
          "A 5-person peer accountability cell for real-life friends. No random matchmaking. Study-focused chat, battle reports, and vote-to-exile.",
      },
    ],
  }),
  component: WarCouncilPage,
});

function useCouncilState() {
  const [council, setCouncil] = useState<Council | null>(() =>
    typeof window === "undefined" ? null : getCouncil(),
  );
  const [me, setMe] = useState(() =>
    typeof window === "undefined" ? { userTag: "#USR-XXXX", name: "You" } : getMe(),
  );
  useEffect(() => {
    setCouncil(getCouncil());
    setMe(getMe());
    maybeCrownWarlord();
    const u = subscribeCouncil(() => {
      setCouncil(getCouncil());
      setMe(getMe());
    });
    return () => {
      u();
    };
  }, []);
  return { council, me };
}

function WarCouncilPage() {
  const { council, me } = useCouncilState();
  const { user } = useAuth();

  // Link the local council identity to the signed-in account so avatars sync.
  useEffect(() => {
    setMyUserId(user?.id ?? null);
  }, [user?.id]);

  const avatars = useCouncilAvatars(council?.members);

  return (
    <div className="flex flex-col gap-6 px-5 pt-6 pb-24">
      <header className="flex items-start gap-3">
        <Link
          to="/discipline"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground"
          aria-label="Back to Discipline hub"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent-amber">
            Discipline · Section E
          </p>
          <h1 className="text-2xl leading-tight">The War Council</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Real-life allies only. 5 seats. No random matchmaking. No public rooms.
          </p>
          <IdentityCard tag={me.userTag} name={me.name} />
        </div>
      </header>

      {council ? (
        <CouncilView council={council} meTag={me.userTag} avatars={avatars} />
      ) : (

        <NoCouncilView />
      )}
    </div>
  );
}

function IdentityCard({ tag, name }: { tag: string; name: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  return (
    <div className="mt-2 flex items-center justify-between rounded-xl border border-border bg-card p-3">
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Your User Tag
        </p>
        {editing ? (
          <div className="mt-1 flex items-center gap-2">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="w-40 rounded-md border border-border bg-background px-2 py-1 text-sm"
            />
            <button
              className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground"
              onClick={() => {
                setMyName(draft);
                setEditing(false);
              }}
            >
              Save
            </button>
          </div>
        ) : (
          <p className="text-sm">
            <span className="font-semibold">{name}</span>{" "}
            <span className="ml-1 rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
              {tag}
            </span>
          </p>
        )}
      </div>
      {!editing && (
        <button
          onClick={() => {
            setDraft(name);
            setEditing(true);
          }}
          className="text-xs text-muted-foreground underline"
        >
          Rename
        </button>
      )}
    </div>
  );
}

function NoCouncilView() {
  const [name, setName] = useState("");
  const [joinTag, setJoinTag] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl border border-primary/40 bg-card p-4">
        <div className="mb-2 flex items-center gap-2 text-primary">
          <ShieldAlert className="h-5 w-5" />
          <h2 className="font-bold">Forge a Council</h2>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          You become the Leader. A Council Tag is generated. Send it privately to
          real-life friends only — never post it publicly.
        </p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Council name (e.g. Bench 4 Bombers)"
          className="mb-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <button
          onClick={() => forgeCouncil(name)}
          className="w-full rounded-md bg-primary py-2 text-sm font-bold text-primary-foreground"
        >
          Forge Council
        </button>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-2 flex items-center gap-2">
          <ClipboardPaste className="h-5 w-5 text-accent-amber" />
          <h2 className="font-bold">Join by Tag</h2>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Paste a Council Tag your friend sent you. There is no search directory.
        </p>
        <input
          value={joinTag}
          onChange={(e) => setJoinTag(e.target.value)}
          placeholder="#CNL-XXXX"
          className="mb-2 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm uppercase"
        />
        <button
          onClick={() => {
            const r = joinCouncilByTag(joinTag);
            setError(r.ok ? null : r.error ?? "Failed.");
          }}
          className="w-full rounded-md border border-accent-amber py-2 text-sm font-bold text-accent-amber"
        >
          Join Council
        </button>
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      </section>

      <p className="text-center text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        No random matchmaking · No public rooms · 5 seats maximum
      </p>
    </div>
  );
}

function CouncilView({
  council,
  meTag,
  avatars,
}: {
  council: Council;
  meTag: string;
  avatars: AvatarMap;
}) {
  const [tab, setTab] = useState<"cell" | "chat" | "report" | "mock" | "exile">(
    "cell",
  );
  const [copied, setCopied] = useState(false);
  const [openMember, setOpenMember] = useState<Member | null>(null);
  const me = council.members.find((m) => m.userTag === meTag);
  const inCouncil = Boolean(me);

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Council
            </p>
            <h2 className="truncate text-lg font-bold">{council.name}</h2>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {council.councilTag}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-primary">
              {council.members.length}/{MAX_MEMBERS}
            </span>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(council.councilTag);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs"
            >
              <Copy className="h-3 w-3" /> {copied ? "Copied" : "Copy Tag"}
            </button>
          </div>
        </div>
      </section>

      <nav className="grid grid-cols-5 gap-1 rounded-xl border border-border bg-card p-1 text-[11px] font-semibold">
        {(
          [
            ["cell", "Cell"],
            ["chat", "Chat"],
            ["report", "Report"],
            ["mock", "Ledger"],
            ["exile", "Exile"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={
              tab === k
                ? "rounded-lg bg-primary py-2 text-primary-foreground"
                : "rounded-lg py-2 text-muted-foreground"
            }
          >
            {l}
          </button>
        ))}
      </nav>

      {tab === "cell" && (
        <CellPanel
          council={council}
          onOpen={setOpenMember}
          inCouncil={inCouncil}
          avatars={avatars}
        />
      )}

      {tab === "chat" && <ChatPanel council={council} inCouncil={inCouncil} />}
      {tab === "report" && <ReportPanel council={council} />}
      {tab === "mock" && <MockLedgerPanel council={council} inCouncil={inCouncil} />}
      {tab === "exile" && <ExilePanel council={council} meTag={meTag} />}

      <div className="mt-2 flex flex-wrap gap-2">
        {inCouncil && (
          <button
            onClick={() => {
              if (confirm("Leave this council?")) leaveCouncil();
            }}
            className="flex items-center gap-1 rounded-md border border-destructive/40 px-3 py-1.5 text-xs text-destructive"
          >
            <LogOut className="h-3 w-3" /> Leave
          </button>
        )}
        {me?.isLeader && (
          <button
            onClick={() => {
              if (confirm("Dissolve council permanently?")) dissolveCouncil();
            }}
            className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground"
          >
            Dissolve
          </button>
        )}
      </div>

      {openMember && (
        <ArmoryModal
          member={openMember}
          meTag={meTag}
          avatarUrl={openMember.userId ? avatars?.[openMember.userId] : undefined}
          onClose={() => setOpenMember(null)}
        />

      )}
    </div>
  );
}

function CellPanel({
  council,
  onOpen,
  inCouncil,
  avatars,
}: {
  council: Council;
  onOpen: (m: Member) => void;
  inCouncil: boolean;
  avatars: AvatarMap;
}) {
  const [allyName, setAllyName] = useState("");
  const slots = MAX_MEMBERS - council.members.length;
  return (
    <div className="flex flex-col gap-3">
      <ul className="grid grid-cols-1 gap-2">
        {council.members.map((m) => {
          const warlord = m.warlordUntil && m.warlordUntil > Date.now();
          const weeklyTier = evaluateWeeklyTier(memberWeeklyHours(m.daily.focusMinutes));
          const avatarUrl = m.userId ? avatars?.[m.userId] : undefined;
          return (
            <li key={m.userTag}>
              <button
                onClick={() => onOpen(m)}
                className={
                  "flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors " +
                  (warlord
                    ? "border-accent-amber shadow-[0_0_24px_-4px_var(--accent-amber)]"
                    : "border-border bg-card hover:border-primary/50")
                }
                style={warlord ? { background: "var(--card)" } : undefined}
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={`${m.name} profile photo`}
                    loading="lazy"
                    className={
                      "h-12 w-12 shrink-0 rounded-full object-cover ring-2 " +
                      (warlord ? "ring-accent-amber" : "ring-primary/30")
                    }
                  />
                ) : (
                  <div
                    className={
                      "grid h-12 w-12 shrink-0 place-items-center rounded-full text-sm font-bold " +
                      (warlord
                        ? "bg-accent-amber text-accent-amber-foreground"
                        : "bg-primary/15 text-primary")
                    }
                  >
                    {memberInitials(m.name)}
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <span className="truncate font-semibold">{m.name}</span>
                    {m.isLeader && (
                      <Crown className="h-3 w-3 text-accent-amber" />
                    )}
                    {warlord && (
                      <Trophy className="h-3 w-3 text-accent-amber" />
                    )}
                  </div>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {m.userTag} · Rank #{m.productivityRank} · {m.daily.tier}
                  </p>
                  <div className="mt-1 flex gap-3 text-[10px] text-muted-foreground">
                    <span>{Math.round(m.daily.focusMinutes / 6) / 10}h focus</span>
                    <span>
                      {m.daily.tasksDone}/{m.daily.tasksTotal} tasks
                    </span>
                  </div>
                  <p className={"mt-0.5 text-[10px] font-bold uppercase tracking-[0.14em] " + (weeklyTier?.accent ?? "text-muted-foreground")}>
                    {weeklyTier ? `T${weeklyTier.tier} · ${weeklyTier.name}` : "UNRANKED"}

                  </p>
                </div>
                <div className="shrink-0 pl-1">
                  <WeeklyBadge tier={weeklyTier} size="md" />
                </div>
              </button>
            </li>
          );
        })}
        {Array.from({ length: slots }).map((_, i) => (
          <li
            key={"slot-" + i}
            className="flex items-center justify-center rounded-2xl border border-dashed border-border p-4 text-xs text-muted-foreground"
          >
            Empty seat — share your Council Tag
          </li>
        ))}
      </ul>

      {inCouncil && slots > 0 && (
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="mb-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Simulate an ally who joined by Tag (single-device demo)
          </p>
          <div className="flex gap-2">
            <input
              value={allyName}
              onChange={(e) => setAllyName(e.target.value)}
              placeholder="Ally name"
              className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            />
            <button
              onClick={() => {
                addSimulatedAlly(allyName);
                setAllyName("");
              }}
              className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
            >
              <UserPlus className="h-3 w-3" /> Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ArmoryModal({
  member,
  meTag,
  avatarUrl,
  onClose,
}: {
  member: Member;
  meTag: string;
  avatarUrl?: string | undefined;
  onClose: () => void;
}) {
  const warlord = member.warlordUntil && member.warlordUntil > Date.now();
  const wake = member.daily.wakeUpAt
    ? new Date(member.daily.wakeUpAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  // For the current user, pull the live cores from the unified Library /
  // Revision-Engine state so progress made in /library shows up here instantly.
  const isMe = member.userTag === meTag;
  const REV_TIER_TO_CORE: Record<number, CoreTierName> = {
    1: "BRONZE CORE",
    2: "IRON CORE",
    3: "STEEL SENTINEL",
    4: "TITANIUM WARDEN",
    5: "PLATINUM CORE",
  };
  const liveEntries = isMe
    ? getAllItems()
        .filter((i) => !i.paused)
        .map((i) => ({
          chapter: i.name,
          tier: REV_TIER_TO_CORE[i.displayTier ?? i.tier] ?? "BRONZE CORE",
          loops: i.displayLoopCount ?? i.loopCount ?? 0,
        }))
    : Object.entries(member.daily.chapterCores).map(([chapter, raw]) => ({
        chapter,
        tier: normalizeCoreTier(raw),
        loops: member.daily.coreLoops?.[chapter] ?? 0,
      }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={
          "w-full max-w-md overflow-hidden rounded-t-3xl border border-border bg-card sm:rounded-3xl " +
          (warlord ? "shadow-[0_0_60px_-10px_var(--accent-amber)]" : "")
        }
      >
        <div className="flex items-center justify-between border-b border-border bg-primary/10 p-4">
          <div className="flex min-w-0 items-center gap-3">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={`${member.name} profile photo`}
                className="h-11 w-11 shrink-0 rounded-full object-cover ring-2 ring-primary/30"
              />
            ) : (
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/15 text-sm font-bold text-primary">
                {memberInitials(member.name)}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.14em] text-primary">
                Live Armory Sheet{isMe ? " · Synced with Library" : ""}
              </p>
              <h3 className="text-lg font-bold">{member.name}</h3>
              <p className="font-mono text-[10px] text-muted-foreground">
                {member.userTag}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-full p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 p-4">
          <Stat label="Wake-up" value={wake} />
          <Stat
            label="Focus Today"
            value={(Math.round(member.daily.focusMinutes / 6) / 10) + " h"}
          />
          <Stat
            label="Tasks"
            value={member.daily.tasksDone + " / " + member.daily.tasksTotal}
          />
          <Stat
            label="Revision Cores"
            value={
              member.daily.revisionCoresCleared +
              " / " +
              Math.max(member.daily.revisionCoresCleared, liveEntries.length)
            }
          />
        </div>
        <div className="border-t border-border p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Active Cores · Armory Wall
            </p>
            <span className="text-[10px] font-mono text-muted-foreground">
              {liveEntries.length} forged
            </span>
          </div>
          <ul className="flex max-h-[52vh] flex-col gap-2 overflow-y-auto pr-1">
            {liveEntries.map(({ chapter, tier, loops }) => {
              const rankLevel = CORE_TIER_TO_RANK[tier];
              return (
                <li
                  key={chapter}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-background/60 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{chapter}</p>
                    <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                      {tier}
                      {tier === "PLATINUM CORE" ? " · MASTERED" : ""}
                    </p>
                  </div>
                  <div className="relative shrink-0">
                    <TierShieldSVG level={rankLevel} size={64} showNumber={false} />
                    {loops >= 1 && (
                      <span
                        className="absolute -right-1 -top-1 rounded-full border border-background bg-[oklch(0.72_0.28_25)] px-1.5 py-0.5 text-[10px] font-black leading-none text-white shadow-[0_0_10px_oklch(0.7_0.3_25/0.75)]"
                        title={`Re-looped ${loops + 1}× total`}
                      >
                        ×{loops + 1}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
            {liveEntries.length === 0 && (
              <li className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                {isMe
                  ? "No chapters tracked yet. Open a note in Library to forge your first core."
                  : "No cores forged yet. The armory wall awaits."}
              </li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold">{value}</p>
    </div>
  );
}

function ChatPanel({ council, inCouncil }: { council: Council; inCouncil: boolean }) {
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);


  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 999999 });
  }, [council.chat.length]);

  const nameFor = (tag: string) =>
    council.members.find((m) => m.userTag === tag)?.name ?? tag;

  const onFile = async (f?: File) => {
    if (!f) return;
    setErr(null);
    setBusy(true);
    const r = await processAcademicImage(f);
    setBusy(false);
    if (!r.ok) {
      setErr(r.error);
      return;
    }
    sendImage(r.dataUrl);
  };

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={scrollRef}
        className="h-[420px] overflow-y-auto rounded-2xl border border-border bg-card p-3"
      >
        <ul className="flex flex-col gap-2">
          {council.chat.map((m) => (
            <li
              key={m.id}
              className={
                m.memberTag === "#SYSTEM"
                  ? "self-center rounded-full bg-muted px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
                  : "max-w-[85%] rounded-2xl border border-border bg-background p-2"
              }
            >
              {m.memberTag !== "#SYSTEM" && (
                <p className="mb-1 text-[10px] font-semibold text-primary">
                  {nameFor(m.memberTag)}{" "}
                  <span className="font-mono text-muted-foreground">
                    {m.memberTag}
                  </span>
                </p>
              )}
              {m.kind === "text" ? (
                <p className="whitespace-pre-wrap text-sm">{m.body}</p>
              ) : (
                <button
                  type="button"
                  onClick={() => setLightbox(m.body)}
                  className="block overflow-hidden rounded-md focus:outline-none focus:ring-2 focus:ring-accent-amber"
                  aria-label="Open image"
                >
                  <img
                    src={m.body}
                    alt="academic diagram"
                    className="max-h-72 cursor-zoom-in rounded-md"
                  />
                </button>
              )}

            </li>
          ))}
        </ul>
      </div>

      {inCouncil ? (
        <div className="rounded-2xl border border-border bg-card p-2">
          <div className="flex items-end gap-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={2}
              placeholder="Coordinate a study block…"
              className="flex-1 resize-none rounded-md border border-border bg-background p-2 text-sm"
            />
            <div className="flex flex-col gap-1">
              <button
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="grid h-9 w-9 place-items-center rounded-md border border-accent-amber text-accent-amber"
                title="Upload academic diagram"
              >
                <ImageIcon className="h-4 w-4" />
              </button>
              <button
                onClick={() => {
                  sendChat(text);
                  setText("");
                }}
                className="grid h-9 w-9 place-items-center rounded-md bg-primary text-primary-foreground"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => onFile(e.target.files?.[0] ?? undefined)}
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            Images are auto-converted to high-contrast monochrome. Vibrant photos,
            memes, and screenshots are rejected. Max 400 KB.
          </p>
          {busy && (
            <p className="mt-1 text-[10px] text-accent-amber">Scanning image…</p>
          )}
          {err && <p className="mt-1 text-[10px] text-destructive">{err}</p>}
        </div>
      ) : (
        <p className="text-center text-xs text-muted-foreground">
          Join this council to participate in chat.
        </p>
      )}
      {lightbox && (
        <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />
      )}
    </div>
  );
}

function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  // transform: translate(tx, ty) scale(zoom) with origin 0,0 in stage space.
  const [zoom, setZoom] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ dist: number; zoom: number; focal: { x: number; y: number }; tx: number; ty: number } | null>(null);
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  const MIN = 0.2;
  const MAX = 8;

  const stagePoint = (clientX: number, clientY: number) => {
    const r = stageRef.current?.getBoundingClientRect();
    return { x: clientX - (r?.left ?? 0), y: clientY - (r?.top ?? 0) };
  };

  const applyZoomAt = (newZoom: number, focal: { x: number; y: number }, baseZoom: number, baseTx: number, baseTy: number) => {
    const nz = Math.max(MIN, Math.min(MAX, newZoom));
    // Keep the image point under `focal` fixed:
    // focal = baseTx + p * baseZoom  →  p = (focal - baseTx)/baseZoom
    // new tx = focal - p * nz
    const ntx = focal.x - ((focal.x - baseTx) / baseZoom) * nz;
    const nty = focal.y - ((focal.y - baseTy) / baseZoom) * nz;
    setZoom(nz); setTx(ntx); setTy(nty);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "+" || e.key === "=") {
        const r = stageRef.current?.getBoundingClientRect();
        const focal = { x: (r?.width ?? 0) / 2, y: (r?.height ?? 0) / 2 };
        applyZoomAt(zoom + 0.5, focal, zoom, tx, ty);
      }
      if (e.key === "-") {
        const r = stageRef.current?.getBoundingClientRect();
        const focal = { x: (r?.width ?? 0) / 2, y: (r?.height ?? 0) / 2 };
        applyZoomAt(zoom - 0.5, focal, zoom, tx, ty);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, zoom, tx, ty]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2) {
      const [a, b] = Array.from(pointersRef.current.values());
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = stagePoint((a.x + b.x) / 2, (a.y + b.y) / 2);
      pinchRef.current = { dist, zoom, focal: mid, tx, ty };
      dragRef.current = null;
    } else if (pointersRef.current.size === 1 && zoom > 1) {
      dragRef.current = { x: e.clientX, y: e.clientY, tx, ty };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 2 && pinchRef.current) {
      const [a, b] = Array.from(pointersRef.current.values());
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const ratio = dist / pinchRef.current.dist;
      // Update focal to current midpoint so the panning-during-pinch feels natural.
      const mid = stagePoint((a.x + b.x) / 2, (a.y + b.y) / 2);
      // Recompute translate anchored to original pinch focal, then shift by focal delta.
      const nz = Math.max(MIN, Math.min(MAX, pinchRef.current.zoom * ratio));
      const p = pinchRef.current;
      const ntx = p.focal.x - ((p.focal.x - p.tx) / p.zoom) * nz + (mid.x - p.focal.x);
      const nty = p.focal.y - ((p.focal.y - p.ty) / p.zoom) * nz + (mid.y - p.focal.y);
      setZoom(nz); setTx(ntx); setTy(nty);
    } else if (dragRef.current && pointersRef.current.size === 1) {
      const dx = e.clientX - dragRef.current.x;
      const dy = e.clientY - dragRef.current.y;
      setTx(dragRef.current.tx + dx);
      setTy(dragRef.current.ty + dy);
    }
  };

  const endPointer = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (pointersRef.current.size === 0) dragRef.current = null;
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const focal = stagePoint(e.clientX, e.clientY);
    applyZoomAt(zoom + (e.deltaY < 0 ? 0.25 : -0.25), focal, zoom, tx, ty);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const focal = stagePoint(e.clientX, e.clientY);
    if (zoom > 1) applyZoomAt(1, focal, zoom, tx, ty);
    else applyZoomAt(2.5, focal, zoom, tx, ty);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-black/95"
      style={{ touchAction: "none", overscrollBehavior: "contain" }}
    >
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <p className="text-[10px] uppercase tracking-[0.16em] text-white/70">
          Diagram Viewer · {Math.round(zoom * 100)}%
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const r = stageRef.current?.getBoundingClientRect();
              const focal = { x: (r?.width ?? 0) / 2, y: (r?.height ?? 0) / 2 };
              applyZoomAt(zoom - 0.5, focal, zoom, tx, ty);
            }}
            className="grid h-9 w-9 place-items-center rounded-full border border-white/40 text-lg text-white"
            aria-label="Zoom out"
          >
            −
          </button>
          <button
            onClick={() => {
              const r = stageRef.current?.getBoundingClientRect();
              const focal = { x: (r?.width ?? 0) / 2, y: (r?.height ?? 0) / 2 };
              applyZoomAt(zoom + 0.5, focal, zoom, tx, ty);
            }}
            className="grid h-9 w-9 place-items-center rounded-full border border-white/40 text-lg text-white"
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            onClick={() => { setZoom(1); setTx(0); setTy(0); }}
            className="rounded-full border border-white/40 px-3 py-1 text-xs text-white"
          >
            Reset
          </button>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full bg-white text-black"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div
        ref={stageRef}
        className="relative flex-1 select-none overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onPointerLeave={endPointer}
        onWheel={onWheel}
        onDoubleClick={onDoubleClick}
        style={{ touchAction: "none" }}
      >
        <img
          src={src}
          alt="academic diagram enlarged"
          className="absolute left-0 top-0 max-h-none max-w-none"
          style={{
            transform: `translate3d(${tx}px, ${ty}px, 0) scale(${zoom})`,
            transformOrigin: "0 0",
            transition: pinchRef.current || dragRef.current ? "none" : "transform 120ms ease-out",
            cursor: zoom > 1 ? "grab" : "zoom-in",
            touchAction: "none",
            willChange: "transform",
          }}
          draggable={false}
          onLoad={(e) => {
            // Center image on load
            const img = e.currentTarget;
            const r = stageRef.current?.getBoundingClientRect();
            if (!r) return;
            const scale = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight, 1);
            const w = img.naturalWidth * scale;
            const h = img.naturalHeight * scale;
            setZoom(scale);
            setTx((r.width - w) / 2);
            setTy((r.height - h) / 2);
          }}
        />
      </div>
      <p className="pb-3 text-center text-[10px] uppercase tracking-[0.16em] text-white/50">
        Pinch to zoom · Drag to pan · Double-tap to reset
      </p>
    </div>
  );
}


function ReportPanel({ council }: { council: Council }) {
  const data = useMemo(
    () =>
      council.members.map((m) => ({
        name: m.name.length > 8 ? m.name.slice(0, 7) + "…" : m.name,
        Focus: Math.round(m.daily.focusMinutes / 6) / 10,
        Tasks: m.daily.tasksDone,
        Cores: m.daily.revisionCoresCleared,
      })),
    [council],
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-2 flex items-center gap-2">
          <Trophy className="h-4 w-4 text-accent-amber" />
          <h3 className="text-sm font-bold">Daily Battle Report</h3>
        </div>
        <p className="mb-3 text-[10px] text-muted-foreground">
          Auto-aggregated. Finalized nightly at 11:59 PM.
        </p>
        <div className="h-64 w-full">
          <ResponsiveContainer>
            <BarChart data={data}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="name"
                stroke="var(--muted-foreground)"
                fontSize={10}
              />
              <YAxis stroke="var(--muted-foreground)" fontSize={10} />
              <Tooltip
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="Focus" fill="var(--primary)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Tasks" fill="var(--accent-amber)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Cores" fill="var(--foreground)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">
          Focus (h) · Tasks Slain · Revision Cores Cleared
        </p>
      </div>

      <div className="rounded-2xl border border-accent-amber/50 bg-card p-4">
        <div className="mb-2 flex items-center gap-2">
          <Crown className="h-4 w-4 text-accent-amber" />
          <h3 className="text-sm font-bold">Council Warlord</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Every Sunday at midnight, the top performer over the last 7 days is
          crowned. Their card glows gold for the week.
        </p>
        <button
          onClick={() => maybeCrownWarlord()}
          className="mt-2 rounded-md border border-accent-amber px-3 py-1 text-xs text-accent-amber"
        >
          Check crown now
        </button>
      </div>
    </div>
  );
}



function MockLedgerPanel({
  council,
  inCouncil,
}: {
  council: Council;
  inCouncil: boolean;
}) {
  const [exam, setExam] = useState("");
  const [score, setScore] = useState("");
  const [scoreMax, setScoreMax] = useState("");


  const rows = council.members.map((m) => {
    const latest = [...council.mockLedger]
      .filter((x) => x.memberTag === m.userTag)
      .sort((a, b) => b.loggedAt - a.loggedAt)[0];
    return { m, latest };
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-border bg-card p-3">
        <div className="mb-2 flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold">Truth & Transparency Shield</h3>
        </div>
        <p className="mb-3 text-[10px] text-muted-foreground">
          App productivity rank vs. real mock-test rank. Inflated study hours
          without real performance are exposed here.
        </p>
        <div className="-mx-3 overflow-x-auto px-3">
          <table className="w-full min-w-[380px] table-fixed border-separate border-spacing-y-1 text-xs">
            <colgroup>
              <col className="w-[32%]" />
              <col className="w-[16%]" />
              <col className="w-[26%]" />
              <col className="w-[26%]" />
            </colgroup>
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                <th className="whitespace-nowrap px-2 py-1.5 text-left">Members</th>
                <th className="whitespace-nowrap px-1 py-1.5 text-left">App Rank</th>
                <th className="whitespace-nowrap px-2 py-1.5 text-left">Exam Score</th>
                <th className="whitespace-nowrap px-2 py-1.5 text-left">Exam Name</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ m, latest }) => {
                const pct = latest ? latest.score / latest.scoreMax : null;
                const underperforming =
                  pct !== null && m.productivityRank <= 2 && pct < 0.5;
                return (
                  <tr
                    key={m.userTag}
                    className={
                      "rounded-lg bg-background/60 " +
                      (underperforming ? "text-destructive" : "")
                    }
                  >
                    <td className="truncate px-2 py-2 text-left font-semibold">{m.name}</td>
                    <td className="px-1 py-2 text-left font-mono tabular-nums">#{m.productivityRank}</td>
                    <td className="px-2 py-2 text-left font-mono tabular-nums">
                      {latest ? `${latest.score} / ${latest.scoreMax}` : "—"}
                    </td>
                    <td className="truncate px-2 py-2 text-left text-muted-foreground">
                      {latest?.examName ?? "—"}
                    </td>
                  </tr>
                );
              })}

            </tbody>
          </table>
        </div>

      </div>

      {inCouncil && (
        <div className="rounded-2xl border border-border bg-card p-3">
          <p className="mb-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Log your true mock score
          </p>
          <div className="grid grid-cols-3 gap-2">
            <input
              value={exam}
              onChange={(e) => setExam(e.target.value)}
              placeholder="Exam"
              className="col-span-3 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            />
            <input
              value={score}
              onChange={(e) => setScore(e.target.value)}
              placeholder="Score (e.g. 470)"
              inputMode="numeric"
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            />
            <input
              value={scoreMax}
              onChange={(e) => setScoreMax(e.target.value)}
              placeholder="Out of (e.g. 720)"
              inputMode="numeric"
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            />
            <button
              onClick={() => {
                logMockScore({
                  examName: exam,
                  score: Number(score) || 0,
                  scoreMax: Number(scoreMax) || 1,
                });
                setExam("");
                setScore("");
                setScoreMax("");
              }}
              className="rounded-md bg-primary py-1.5 text-xs font-semibold text-primary-foreground"
            >
              Log
            </button>

          </div>
        </div>
      )}
    </div>
  );
}

function ExilePanel({ council, meTag }: { council: Council; meTag: string }) {
  const inCouncil = council.members.some((m) => m.userTag === meTag);
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-destructive/40 bg-card p-3">
        <div className="mb-2 flex items-center gap-2">
          <Gavel className="h-4 w-4 text-destructive" />
          <h3 className="text-sm font-bold">Vote to Exile</h3>
        </div>
        <p className="text-[10px] text-muted-foreground">
          If 3 of the remaining 4 downvote a member within 24 hours, they are
          instantly exiled. Their data is purged from this council. Slot opens.
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {council.members
          .filter((m) => m.userTag !== meTag)
          .map((m) => {
            const downs = activeDownVotes(m.userTag);
            return (
              <li
                key={m.userTag}
                className="flex items-center justify-between rounded-xl border border-border bg-card p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{m.name}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {m.userTag}
                  </p>
                  <p className="mt-1 text-[10px] text-destructive">
                    {downs}/3 downvotes (24h)
                  </p>
                </div>
                {inCouncil && (
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => castExileVote(m.userTag, false)}
                      className="grid h-8 w-8 place-items-center rounded-md border border-border text-muted-foreground"
                      title="Keep"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => castExileVote(m.userTag, true)}
                      className="grid h-8 w-8 place-items-center rounded-md border border-destructive text-destructive"
                      title="Exile"
                    >
                      <Gavel className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        {council.members.length <= 1 && (
          <li className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            <Users className="mx-auto mb-1 h-4 w-4" /> Add allies before votes are
            meaningful.
          </li>
        )}
      </ul>
    </div>
  );
}
