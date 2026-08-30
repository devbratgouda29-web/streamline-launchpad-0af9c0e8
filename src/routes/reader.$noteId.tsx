import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Eraser,
  Home,
  Pen,
  Settings2,
  PencilLine,
  Sparkles,
  Timer,
  Undo2,
  Redo2,
  Search,
  X,
} from "lucide-react";
import { RecallTimerBadge } from "@/components/RecallTimerBadge";
import { TierBadge } from "@/components/TierBadge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { ReviewsSection } from "@/components/ReviewsSection";
import { getDeskItem, type DeskItem } from "@/lib/desk-store";
import {
  advanceOnClaim,
  getItemBySource,
  pauseItem,
  repairFractured,
  
  setDifficulty,
  type Difficulty,
  type RevisionItem,
} from "@/lib/revision-engine";
import { useAuth } from "@/hooks/use-auth";
import { dataUrlToBlobUrl } from "@/lib/pdf-blob";
import { PdfViewer } from "@/components/PdfViewer";
import {
  clearSession,
  ensureSession,
  extendSession,
  finishEarly,
  getSession,
  heartbeat,
  markCompleted,
  resetToStart,
  setPlaying,
  spentMsOf,
  subscribe as subscribeSession,
  ABSENCE_RESET_MS,
  EXTENSION_MS,
  type RecallSession,
} from "@/lib/recall-session";
import { recordRevisionSession } from "@/lib/revision-logs";
import { useLanguagePreference } from "@/lib/language-preference";
import {
  listNotes,
  pdfPathForLanguage,
  signedPdfUrl,
  type Note,
} from "@/lib/notes-store";


type ReaderMode = "standard" | "recall";

export const Route = createFileRoute("/reader/$noteId")({
  validateSearch: (search: Record<string, unknown>): { mode: ReaderMode } => ({
    mode: search.mode === "recall" ? "recall" : "standard",
  }),
  head: () => ({
    meta: [
      { title: "Reader — From The Last Bench" },
      { name: "description", content: "Read your purchased note pack with annotation tools." },
    ],
  }),
  component: ReaderPage,
});

/**
 * Shared hook: initialize/resume the recall session for the given note,
 * heartbeat while mounted, apply the 10-minute absence-reset rule on return,
 * and expose completion state + claim/exit helpers used by the overlay.
 */
function useReaderRecall(sourceId: string, mode: ReaderMode) {
  const navigate = useNavigate();
  const { requireAuth } = useAuth();
  const isRecall = mode === "recall";
  const [session, setSession] = useState<RecallSession | null>(() =>
    isRecall ? getSession() : null,
  );
  const [claimed, setClaimed] = useState<{
    itemId: string;
    badge: string;
    tier: RevisionItem["tier"];
    loopCount: number;
    justCompletedPlatinum: boolean;
    repaired: boolean;
  } | null>(null);
  const hiddenAtRef = useRef<number | null>(null);
  const loggedRef = useRef(false);

  // Ensure a session exists for this source (only in recall mode).
  useEffect(() => {
    if (!isRecall) {
      setSession(null);
      return;
    }
    const tracked = getItemBySource(sourceId);
    if (tracked) {
      const s = ensureSession({
        itemId: tracked.id,
        sourceId,
        isDebt: !!tracked.fractured,
        tier: tracked.tier,
        loopCount: tracked.loopCount ?? 0,
      });
      setSession(s);
    } else {
      setSession(getSession());
    }
    const unsub = subscribeSession((s) => setSession(s));
    return () => unsub();
  }, [sourceId, isRecall]);

  // Auto-pause the running timer whenever the reader unmounts (back nav, etc).
  useEffect(() => {
    if (!isRecall) return;
    return () => setPlaying(false);
  }, [isRecall]);

  // Heartbeat + absence reset (recall mode only)
  useEffect(() => {
    if (!isRecall) return;
    const iv = window.setInterval(() => heartbeat(), 15_000);
    heartbeat();
    const onVis = () => {
      if (document.hidden) {
        hiddenAtRef.current = Date.now();
      } else if (hiddenAtRef.current) {
        const away = Date.now() - hiddenAtRef.current;
        hiddenAtRef.current = null;
        if (away > ABSENCE_RESET_MS) {
          resetToStart();
        }
        heartbeat();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [isRecall]);

  // Dev-pass bypass listener — force complete instantly (recall mode only).
  useEffect(() => {
    if (!isRecall) return;
    const onBypass = () => {
      const cur = getSession();
      if (!cur || cur.sourceId !== sourceId) return;
      markCompleted();
    };
    window.addEventListener("devpass:bypass", onBypass);
    return () => window.removeEventListener("devpass:bypass", onBypass);
  }, [sourceId, isRecall]);

  const claim = useCallback(() => {
    if (!requireAuth("reward")) return;
    const cur = getSession();
    if (!cur) return;
    const preItem = getItemBySource(cur.sourceId);
    // Session duration log: Base + Overtime − Early-finish delta.
    if (!loggedRef.current) {
      loggedRef.current = true;
      const desk = getDeskItem(cur.sourceId) as (DeskItem & { subject?: string }) | null;
      recordRevisionSession({
        itemId: cur.itemId,
        chapterName: preItem?.name ?? desk?.name ?? "Chapter",
        subject: desk?.subject ?? "",
        totalMs: spentMsOf(cur),
        baseMs: cur.baseDurationMs ?? cur.durationMs,
        overtimeMs: cur.overtimeMs ?? 0,
      });
    }
    // Debt Recall: repair the CURRENT tier badge instead of advancing.
    if (cur.isDebt || preItem?.fractured) {
      const repaired = repairFractured(cur.itemId);
      if (!repaired) return;
      const tier = repaired.tier;
      const loopCount = repaired.loopCount ?? 0;
      const map: Record<RevisionItem["tier"], string> = {
        1: "BRONZE CORE",
        2: "IRON CORE",
        3: "STEEL SENTINEL",
        4: "TITANIUM CORE",
        5: "PLATINUM CORE",
      };
      const badge = loopCount > 0 ? `${map[tier]} x${loopCount + 1}` : map[tier];
      setClaimed({
        itemId: cur.itemId,
        badge,
        tier,
        loopCount,
        justCompletedPlatinum: false,
        repaired: true,
      });
      return;
    }
    const wasPlatinum = preItem?.tier === 5;
    const result = advanceOnClaim(cur.itemId);
    if (result) {
      setClaimed({ itemId: cur.itemId, ...result, justCompletedPlatinum: wasPlatinum, repaired: false });
    }
  }, [requireAuth]);

  /** "⏱️ Add 10 Mins More" — closes the popup and resumes with +10 min. */
  const addTime = useCallback(() => {
    const next = extendSession(EXTENSION_MS);
    if (next) setSession(next);
  }, []);

  /** "✨ Finish & Claim Reward" — ends overtime now and opens the claim state. */
  const finishNow = useCallback(() => {
    const next = finishEarly();
    if (next) setSession(next);
  }, []);

  const exit = useCallback(() => {
    clearSession();
    setClaimed(null);
    navigate({ to: "/home" });
  }, [navigate]);

  const active = !!session && session.sourceId === sourceId;
  const completed = active && (session?.completed === true || (session?.remainingMs ?? 0) <= 0);
  const inOvertime = active && (session?.overtimeMs ?? 0) > 0;

  return {
    session,
    active,
    completed,
    inOvertime,
    claimed,
    claim,
    addTime,
    finishNow,
    exit,
  };
}


/**
 * Completion overlay — replaces the "trapped in PDF" dead-end.
 * Shows CLAIM REWARD → badge celebration → Exit / Return to Hub.
 */
function ReaderCompletionOverlay({
  claimed,
  onClaim,
  onAddTime,
  onExit,
}: {
  claimed: {
    itemId: string;
    badge: string;
    tier: RevisionItem["tier"];
    loopCount: number;
    justCompletedPlatinum: boolean;
    repaired: boolean;
  } | null;
  onClaim: () => void;
  onAddTime: () => void;
  onExit: () => void;
}) {
  const [pickDifficulty, setPickDifficulty] = useState(false);
  const chooseDifficulty = (d: Difficulty) => {
    if (!claimed) return;
    setDifficulty(claimed.itemId, d);
    onExit();
  };
  const pauseTracking = () => {
    if (!claimed) return;
    pauseItem(claimed.itemId);
    onExit();
  };
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/85 p-6 backdrop-blur-md">
      <div className="w-full max-w-sm rounded-3xl border border-amber-300/40 bg-gradient-to-b from-neutral-950 to-neutral-900 p-6 text-center shadow-2xl">
        {!claimed ? (
          <>
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-300">
              Recall Complete
            </p>
            <h2 className="mt-2 text-2xl font-black text-white">Your session is sealed.</h2>
            <p className="mt-2 text-sm text-white/70">
              The timer hit 00:00. Claim your badge to advance the chapter to its next revision tier.
            </p>
            <p className="mt-4 rounded-2xl border border-amber-300/25 bg-amber-300/10 p-3 text-xs leading-relaxed text-amber-100/90">
              Haven't finished your revision yet? Be honest with yourself—don't claim your reward
              until you've thoroughly revised. Need extra time?
            </p>
            <button
              type="button"
              onClick={onClaim}
              className="mt-6 inline-flex w-full animate-pulse items-center justify-center gap-2 rounded-2xl border-2 border-amber-300 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400 px-5 py-3.5 text-sm font-black uppercase tracking-[0.22em] text-black shadow-[0_0_32px_rgba(251,191,36,0.85)] hover:brightness-110"
            >
              <Sparkles className="h-4 w-4" /> Claim Reward
            </button>
            <button
              type="button"
              onClick={onAddTime}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-purple-400/60 bg-purple-500/20 px-5 py-3 text-xs font-black uppercase tracking-[0.2em] text-purple-50 hover:bg-purple-500/30"
            >
              <Timer className="h-4 w-4" /> Add 10 Mins More
            </button>
            <button
              type="button"
              onClick={onExit}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/5 px-5 py-3 text-xs font-bold uppercase tracking-[0.2em] text-white/80 hover:bg-white/10"
            >
              <Home className="h-4 w-4" /> Exit / Return to Hub
            </button>
          </>
        ) : pickDifficulty ? (
          <>
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-300">
              Choose Your Path · Loop {claimed.loopCount + 1}
            </p>
            <h2 className="mt-2 text-2xl font-black text-white">Select Difficulty</h2>
            <p className="mt-2 text-sm text-white/70">
              You forged Platinum. Pick the mode for your next cycle — it locks until you complete Tier 5 again.
            </p>
            <div className="mt-6 grid gap-3">
              <button
                type="button"
                onClick={() => chooseDifficulty("easy")}
                className="rounded-2xl border border-emerald-500/50 bg-emerald-500/15 p-4 text-left hover:bg-emerald-500/25"
              >
                <p className="text-sm font-black uppercase tracking-widest text-emerald-300">Easy Mode</p>
                <p className="mt-1 text-xs text-white/70">Longer spaced intervals · Recall in 24h</p>
              </button>
              <button
                type="button"
                onClick={() => chooseDifficulty("hard")}
                className="rounded-2xl border border-destructive/50 bg-destructive/15 p-4 text-left hover:bg-destructive/25"
              >
                <p className="text-sm font-black uppercase tracking-widest text-destructive">Hard Mode</p>
                <p className="mt-1 text-xs text-white/70">Aggressive intervals · Recall in 12h</p>
              </button>
              <button
                type="button"
                onClick={pauseTracking}
                className="rounded-2xl border border-white/25 bg-white/5 p-4 text-left hover:bg-white/10"
              >
                <p className="text-sm font-black uppercase tracking-widest text-white/90">
                  Pause Tracking / Schedule Later
                </p>
                <p className="mt-1 text-xs text-white/60">
                  Freezes this chapter · your {claimed?.badge ?? "highest badge"} stays. Resume anytime to start a new loop.
                </p>
              </button>
            </div>
          </>
        ) : (() => {
          // Resolve the ACTUAL tier that was just claimed/repaired so the
          // header, shield graphic, and label all agree — never default to
          // Bronze regardless of the underlying tier.
          const awardedTier: RevisionItem["tier"] = claimed.repaired
            ? claimed.tier
            : ((claimed.tier === 1 && claimed.loopCount > 0
                ? 5
                : Math.max(1, claimed.tier - 1)) as RevisionItem["tier"]);
          const awardedLoop = claimed.repaired
            ? claimed.loopCount
            : claimed.tier === 1 && claimed.loopCount > 0
              ? claimed.loopCount - 1
              : claimed.loopCount;
          const tierName =
            ({ 1: "BRONZE CORE", 2: "IRON CORE", 3: "STEEL SENTINEL", 4: "TITANIUM CORE", 5: "PLATINUM CORE" } as const)[
              awardedTier
            ];
          const loopSuffix = awardedLoop > 0 ? ` ×${awardedLoop + 1}` : "";
          const accent = claimed.repaired ? "text-emerald-300" : "text-amber-300";
          const labelAccent = claimed.repaired ? "text-emerald-200" : "text-amber-200";
          const btnClass = claimed.repaired
            ? "bg-emerald-400 hover:bg-emerald-300"
            : "bg-amber-400 hover:bg-amber-300";
          return (
            <>
              <p className={`text-[10px] font-black uppercase tracking-[0.28em] ${accent}`}>
                {claimed.repaired ? "Badge Restored" : "Badge Awarded"}
              </p>
              <h2 className="mt-2 text-2xl font-black text-white">
                {tierName}
                {loopSuffix} {claimed.repaired ? "Restored" : "Unlocked"}
              </h2>
              <div className="mt-5 flex justify-center">
                <TierBadge tier={awardedTier} size={96} loopCount={awardedLoop} />
              </div>
              <p className={`mt-4 text-lg font-black uppercase tracking-[0.18em] ${labelAccent}`}>
                {claimed.badge}
              </p>
              <p className="mt-2 text-xs text-white/60">
                {claimed.repaired
                  ? `Your ${tierName} shield is repaired. Complete the next scheduled recall for Tier ${awardedTier} to advance.`
                  : `Chapter advanced to Tier ${claimed.tier}${claimed.loopCount > 0 ? ` · Re-Loop ×${claimed.loopCount + 1}` : ""}.`}
              </p>
              {!claimed.repaired && claimed.justCompletedPlatinum ? (
                <button
                  type="button"
                  onClick={() => setPickDifficulty(true)}
                  className={`mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl ${btnClass} px-5 py-3 text-sm font-black uppercase tracking-[0.2em] text-black`}
                >
                  <Sparkles className="h-4 w-4" /> Choose Next Difficulty
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onExit}
                  className={`mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl ${btnClass} px-5 py-3 text-sm font-black uppercase tracking-[0.2em] text-black`}
                >
                  <Home className="h-4 w-4" /> Exit / Return to Hub
                </button>
              )}
            </>
          );
        })()}
      </div>
    </div>
  );
}

const TOTAL_PAGES = 6;
const MIN_SCALE = 1;
const MAX_SCALE = 4;

type Direction = "horizontal" | "vertical";
type Background = "original" | "invert";

const COLORS = [
  "#000000",
  "#FFFFFF",
  "#9CA3AF",
  "#EF4444",
  "#22C55E",
  "#3B82F6",
  "#D946EF",
  "#06B6D4",
  "#F97316",
  "#FACC15",
];

// Points and size stored as fractions of canvas size so they stay glued
// to their spot on the page regardless of zoom / DPR / container size.
type Stroke = {
  color: string;
  sizeFrac: number;
  mode: "pen" | "eraser";
  points: { x: number; y: number }[]; // 0..1
};

type AnnotateSettings = {
  active: boolean;
  tool: "pen" | "eraser";
  color: string;
  size: number;
};

function ReaderPage() {
  const { noteId } = useParams({ from: "/reader/$noteId" });
  const { mode } = Route.useSearch();
  if (noteId.startsWith("desk-")) {
    return <DeskReader noteId={noteId} mode={mode} />;
  }
  return <PremiumReader noteId={noteId} mode={mode} />;
}

function PremiumReader({ noteId, mode }: { noteId: string; mode: ReaderMode }) {
  const recall = useReaderRecall(noteId, mode);
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [barOpen, setBarOpen] = useState(true);
  const [blurred, setBlurred] = useState(false);
  const [showReviews, setShowReviews] = useState(false);

  // Real uploaded content for THIS published note (never hardcoded).
  const [language] = useLanguagePreference();
  const [note, setNote] = useState<Note | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfPages, setPdfPages] = useState<number | null>(null);
  const [pdfLoading, setPdfLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setPdfLoading(true);
    setPdfUrl(null);
    setPage(1);
    void (async () => {
      try {
        const all = await listNotes();
        if (!active) return;
        const found = all.find((n) => n.id === noteId) ?? null;
        setNote(found);
        const path = found ? pdfPathForLanguage(found, language, all) : null;
        const url = path ? await signedPdfUrl(path) : null;
        if (active) setPdfUrl(url);
      } catch {
        if (active) setPdfUrl(null);
      } finally {
        if (active) setPdfLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [noteId, language]);

  const totalPages = pdfPages ?? note?.page_count ?? TOTAL_PAGES;


  // View mode panel state
  const [viewOpen, setViewOpen] = useState(false);
  const [direction, setDirection] = useState<Direction>("horizontal");
  const [background, setBackground] = useState<Background>("original");
  const [pageByPage, setPageByPage] = useState(true);
  const [keepScreenOn, setKeepScreenOn] = useState(false);

  // Annotate state
  const [annotateOpen, setAnnotateOpen] = useState(false);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [color, setColor] = useState("#EF4444");
  const [size, setSize] = useState(4);
  const { strokes, commitStroke, undo, redo, clearPage, canUndo, canRedo } = useAnnotations(noteId);

  useEffect(() => {
    const onVis = () => setBlurred(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const next = () => setPage((p) => Math.min(totalPages, p + 1));
  const prev = () => setPage((p) => Math.max(1, p - 1));

  const nightModeFilter = background === "invert" ? "invert(1) hue-rotate(180deg)" : "none";

  const annotate: AnnotateSettings = { active: annotateOpen, tool, color, size };


  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black text-white"
      onContextMenu={(e) => e.preventDefault()}
      style={{ userSelect: "none", WebkitUserSelect: "none" }}
    >
      {/* Top bar */}
      <div
        className={cn(
          "absolute inset-x-0 top-0 z-20 flex items-center gap-3 bg-gradient-to-b from-black/90 to-transparent px-4 pb-6 pt-3 transition-transform",
          barOpen ? "translate-y-0" : "-translate-y-full",
        )}
      >
        {recall.active && recall.inOvertime && !recall.completed ? (
          <button
            type="button"
            onClick={recall.finishNow}
            className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-emerald-300/60 bg-emerald-500/25 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-50 shadow-lg backdrop-blur hover:bg-emerald-500/40"
          >
            <Sparkles className="h-3.5 w-3.5" /> Finish &amp; Claim Reward
          </button>
        ) : null}
        {recall.active ? (
          <RecallTimerBadge sourceId={noteId} onClaim={recall.claim} />
        ) : null}

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{note?.title ?? "Loading…"}</p>
          <p className="text-[11px] text-white/70">
            Page {page} of {totalPages}
          </p>
        </div>
      </div>

      {/* Canvas / Page area */}
      <div
        className={cn(
          "relative flex-1 overflow-hidden",
          direction === "vertical" && "overflow-y-auto",
        )}
        onClick={(e) => {
          if (annotateOpen) return;
          if (direction === "vertical" || !pageByPage) {
            setBarOpen((v) => !v);
            return;
          }
          const w = e.currentTarget.clientWidth;
          const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
          if (x < w * 0.3) prev();
          else if (x > w * 0.7) next();
          else setBarOpen((v) => !v);
        }}
      >
        {pdfUrl ? (
          direction === "vertical" ? (
            <div className="absolute inset-0 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4 p-4">
                {Array.from({ length: totalPages }, (_, i) => (
                  <div key={i} className="relative w-full">
                    {/* Invert applies to the PDF layer only, so annotations
                        keep their true colors and stay fully visible. */}
                    <div style={{ filter: nightModeFilter }}>
                      <PdfViewer
                        src={pdfUrl}
                        name={note?.title ?? "note"}
                        className="w-full"
                        hideControls
                        page={i + 1}
                        onNumPages={(n) => setPdfPages(n)}
                      />
                    </div>
                    <AnnotateOverlay
                      page={i + 1}
                      strokes={strokes[i + 1] ?? []}
                      onCommitStroke={commitStroke}
                      annotate={annotate}
                    />

                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <div
                className="relative flex h-full w-full max-w-3xl items-center justify-center"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex h-full w-full items-center justify-center" style={{ filter: nightModeFilter }}>
                  <PdfViewer
                    src={pdfUrl}
                    name={note?.title ?? "note"}
                    className="h-full w-full"
                    fit="contain"
                    hideControls
                    page={page}
                    onNumPages={(n) => setPdfPages(n)}
                    onPageChange={(p) => setPage(p)}
                  />
                </div>
                <AnnotateOverlay
                  page={page}
                  strokes={strokes[page] ?? []}
                  onCommitStroke={commitStroke}
                  annotate={annotate}
                />

              </div>
            </div>
          )
        ) : pdfLoading ? (
          <div className="absolute inset-0 grid place-items-center text-xs text-white/60">
            Loading your note…
          </div>
        ) : note && !pdfPathForLanguage(note, language) ? (
          <div className="absolute inset-0 grid place-items-center px-8 text-center text-xs text-white/60">
            The {language === "english" ? "English" : "Hinglish"} PDF for “{note.title}” hasn’t been
            uploaded yet.
          </div>
        ) : direction === "horizontal" ? (
          <div className="absolute inset-0 flex snap-x snap-mandatory items-center gap-4 overflow-x-auto px-4 py-4">
            <div className="mx-auto flex w-full max-w-3xl shrink-0 snap-center items-center justify-center">
              <PageStage
                page={page}
                direction={direction}
                strokes={strokes[page] ?? []}
                onCommitStroke={commitStroke}
                annotate={annotate}
                nightModeFilter={nightModeFilter}
              />
            </div>
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4 p-4">
            {Array.from({ length: totalPages }, (_, i) => (
              <PageStage
                key={i}
                page={i + 1}
                direction={direction}
                strokes={strokes[i + 1] ?? []}
                onCommitStroke={commitStroke}
                annotate={annotate}
                nightModeFilter={nightModeFilter}
              />
            ))}
          </div>
        )}


        {/* Watermark */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
          <span className="rotate-[-30deg] text-3xl font-black text-white/10 tracking-widest">
            STUDENT · s***@mail.com
          </span>
        </div>

        {/* Blur overlay when tab hidden */}
        {blurred && (
          <div className="absolute inset-0 z-40 grid place-items-center bg-black/95 backdrop-blur-xl">
            <p className="text-sm text-white/70">Content hidden</p>
          </div>
        )}
      </div>

      {/* Annotate toolbar (above bottom bar when active) */}
      {annotateOpen && (
        <div className="absolute inset-x-0 bottom-[76px] z-30 mx-auto max-w-md px-4">
          {/* Undo/Redo row — sits directly above the color palette toolbar */}
          <div className="mb-2 flex items-center justify-end gap-2">
            <button
              onClick={undo}
              disabled={!canUndo}
              className="grid h-9 w-9 place-items-center rounded-full bg-neutral-900/95 ring-1 ring-white/10 backdrop-blur disabled:opacity-30"
              aria-label="Undo"
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              className="grid h-9 w-9 place-items-center rounded-full bg-neutral-900/95 ring-1 ring-white/10 backdrop-blur disabled:opacity-30"
              aria-label="Redo"
            >
              <Redo2 className="h-4 w-4" />
            </button>
          </div>

          <div className="rounded-2xl bg-neutral-900/95 p-3 shadow-2xl ring-1 ring-white/10 backdrop-blur">
            <div className="mb-2 flex items-center gap-2">
              <button
                onClick={() => setTool("pen")}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold",
                  tool === "pen"
                    ? "bg-accent-amber text-accent-amber-foreground"
                    : "bg-white/10 text-white/80",
                )}
              >
                <Pen className="h-3.5 w-3.5" /> Pen
              </button>
              <button
                onClick={() => setTool("eraser")}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold",
                  tool === "eraser"
                    ? "bg-accent-amber text-accent-amber-foreground"
                    : "bg-white/10 text-white/80",
                )}
              >
                <Eraser className="h-3.5 w-3.5" /> Eraser
              </button>
              <button
                onClick={() => clearPage(page)}
                className="ml-auto rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-medium text-white/80"
              >
                Clear
              </button>
              <button
                onClick={() => setAnnotateOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-full bg-white/10"
                aria-label="Close annotate"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-2 flex items-center gap-3">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-white/50">
                Size
              </span>
              <Slider
                value={[size]}
                min={1}
                max={24}
                step={1}
                onValueChange={(v) => setSize(v[0] ?? 4)}
                className="flex-1"
              />
              <span className="w-6 text-right text-xs tabular-nums text-white/70">{size}</span>
            </div>

            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => {
                    setColor(c);
                    setTool("pen");
                  }}
                  aria-label={`Color ${c}`}
                  className={cn(
                    "h-6 w-6 rounded-full ring-1 ring-white/20 transition-transform",
                    color === c && tool === "pen" && "scale-125 ring-2 ring-accent-amber",
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* View Mode panel */}
      {viewOpen && (
        <>
          <div
            className="absolute inset-0 z-40 bg-black/60"
            onClick={() => setViewOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 z-50 mx-auto max-w-md rounded-t-3xl bg-neutral-950 p-5 pb-[calc(env(safe-area-inset-bottom)+20px)] shadow-2xl ring-1 ring-white/10">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold">View Mode</h3>
              <button
                onClick={() => setViewOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-full bg-white/10"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <Section label="Reading Direction">
              <Segmented
                value={direction}
                onChange={(v) => setDirection(v as Direction)}
                options={[
                  { value: "horizontal", label: "Horizontal" },
                  { value: "vertical", label: "Vertical" },
                ]}
              />
            </Section>

            <Section label="Background">
              <Segmented
                value={background}
                onChange={(v) => setBackground(v as Background)}
                options={[
                  { value: "original", label: "Original" },
                  { value: "invert", label: "Invert" },
                ]}
              />
            </Section>

            <Section label="Page Controls">
              <Row
                label="Page by page"
                checked={pageByPage}
                onChange={setPageByPage}
              />
              <Row
                label="Keep screen on"
                checked={keepScreenOn}
                onChange={setKeepScreenOn}
              />
            </Section>
          </div>
        </>
      )}

      {/* Bottom bar */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/90 to-transparent px-3 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-6 transition-transform",
          barOpen ? "translate-y-0" : "translate-y-full",
        )}
      >
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-center gap-2">
        <button
          onClick={prev}
          disabled={page === 1 || direction === "vertical"}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 disabled:opacity-30"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <input
          type="range"
          min={1}
          max={totalPages}
          value={page}
          onChange={(e) => setPage(Number(e.target.value))}
          className="min-w-0 flex-1 basis-40 accent-[oklch(0.78_0.14_78)]"
          aria-label="Page scrubber"
        />
        <button
          onClick={next}
          disabled={page === totalPages || direction === "vertical"}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 disabled:opacity-30"
          aria-label="Next page"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
        <PageSearch total={totalPages} onGo={(p) => setPage(p)} />
        <button
          onClick={() => {
            setViewOpen(true);
            setAnnotateOpen(false);
          }}
          className="flex shrink-0 items-center gap-1 rounded-full bg-white/10 px-3 py-2 text-[11px] font-semibold"
        >
          <Settings2 className="h-3.5 w-3.5" /> View
        </button>
        <button
          onClick={() => setAnnotateOpen((v) => !v)}
          className={cn(
            "flex shrink-0 items-center gap-1 rounded-full px-3 py-2 text-[11px] font-bold",
            annotateOpen
              ? "bg-accent-amber text-accent-amber-foreground"
              : "bg-white/10 text-white",
          )}
        >
          <PencilLine className="h-3.5 w-3.5" /> Annotate
        </button>
        <button
          onClick={() => setShowReviews((v) => !v)}
          className="shrink-0 rounded-full bg-accent-amber px-3 py-2 text-[11px] font-bold text-accent-amber-foreground"
        >
          Reviews
        </button>
        </div>
      </div>

      {/* Reviews drawer */}
      {showReviews && (
        <div className="absolute inset-x-0 bottom-0 top-16 z-40 overflow-y-auto rounded-t-3xl bg-background p-5 text-foreground shadow-2xl">
          <div className="mx-auto flex max-w-md flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Reviews</h2>
              <button
                onClick={() => setShowReviews(false)}
                className="rounded-full bg-muted px-3 py-1 text-sm"
              >
                Close
              </button>
            </div>
            <ReviewsSection noteId={noteId} />
          </div>
        </div>
      )}

      {recall.completed && (
        <ReaderCompletionOverlay
          claimed={recall.claimed}
          onClaim={recall.claim}
          onAddTime={recall.addTime}
          onExit={recall.exit}
        />
      )}
    </div>
  );
}

function DeskReader({ noteId, mode }: { noteId: string; mode: ReaderMode }) {
  const recall = useReaderRecall(noteId, mode);
  const navigate = useNavigate();
  const [item, setItem] = useState<DeskItem | null>(null);
  useEffect(() => {
    setItem(getDeskItem(noteId));
  }, [noteId]);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  useEffect(() => {
    setPdfBlobUrl(null);
    if (item?.kind === "pdf" && item.dataUrl) {
      const url = dataUrlToBlobUrl(item.dataUrl);
      setPdfBlobUrl(url);
      return () => {
        if (url.startsWith("blob:")) URL.revokeObjectURL(url);
      };
    }
  }, [item?.id, item?.dataUrl, item?.kind]);

  const [barOpen, setBarOpen] = useState(true);
  const [page, setPage] = useState(1);
  const [numPages, setNumPages] = useState(1);
  const [viewOpen, setViewOpen] = useState(false);
  const [direction, setDirection] = useState<Direction>("horizontal");
  const [background, setBackground] = useState<Background>("original");

  // Annotate state (mirrors PremiumReader)
  const [annotateOpen, setAnnotateOpen] = useState(false);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [color, setColor] = useState("#EF4444");
  const [size, setSize] = useState(4);
  const { strokes, commitStroke, undo, redo, clearPage, canUndo, canRedo } = useAnnotations(noteId);


  if (!item) {
    return (
      <div className="min-h-screen bg-background px-5 py-10 text-foreground">
        <Link to="/library" className="inline-flex items-center gap-1 text-sm text-accent-amber">
          <ArrowLeft className="h-4 w-4" /> Library
        </Link>
        <p className="mt-4 text-sm text-muted-foreground">This desk item couldn't be found.</p>
      </div>
    );
  }

  const track = getItemBySource(noteId);
  const nightModeFilter = background === "invert" ? "invert(1) hue-rotate(180deg)" : "none";
  const isPdf = item.kind === "pdf" && !!pdfBlobUrl;
  const annotate: AnnotateSettings = { active: annotateOpen, tool, color, size };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      {/* Top bar */}
      <div
        className={cn(
          "absolute inset-x-0 top-0 z-20 flex items-center gap-3 bg-gradient-to-b from-black/90 to-transparent px-4 pb-6 pt-3 transition-transform",
          barOpen ? "translate-y-0" : "-translate-y-full",
        )}
      >
        {recall.active && recall.inOvertime && !recall.completed ? (
          <button
            type="button"
            onClick={recall.finishNow}
            className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-emerald-300/60 bg-emerald-500/25 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-50 shadow-lg backdrop-blur hover:bg-emerald-500/40"
          >
            <Sparkles className="h-3.5 w-3.5" /> Finish &amp; Claim Reward
          </button>
        ) : null}
        {recall.active ? (
          <RecallTimerBadge sourceId={noteId} onClaim={recall.claim} />
        ) : null}

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{item.name}</p>
          <p className="text-[11px] text-white/70">
            {isPdf ? `Page ${page} of ${numPages}` : "Physical Study Material"}
          </p>
        </div>
      </div>

      {/* Canvas / Page area — centered stage on dark backdrop, matches PremiumReader */}
      <div
        className="relative flex-1 overflow-hidden bg-black"
        onClick={() => {
          if (annotateOpen) return;
          setBarOpen((v) => !v);
        }}
      >
        {isPdf ? (
          direction === "vertical" ? (
            <div
              className="absolute inset-0 overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4 p-4">
                {Array.from({ length: numPages }, (_, i) => (
                  <div key={i} className="relative w-full">
                    <div style={{ filter: nightModeFilter }}>
                      <PdfViewer
                        src={pdfBlobUrl!}
                        name={item.name}
                        className="w-full"
                        hideControls
                        page={i + 1}
                        onNumPages={(n) => {
                          setNumPages(n);
                          setPage((p) => Math.min(Math.max(1, p), n));
                        }}
                      />
                    </div>
                    <AnnotateOverlay
                      page={i + 1}
                      strokes={strokes[i + 1] ?? []}
                      onCommitStroke={commitStroke}
                      annotate={annotate}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <div
                className="relative flex h-full w-full max-w-3xl items-center justify-center"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex h-full w-full items-center justify-center" style={{ filter: nightModeFilter }}>
                  <PdfViewer
                    src={pdfBlobUrl!}
                    name={item.name}
                    className="h-full w-full"
                    fit="contain"
                    hideControls
                    page={page}
                    onNumPages={(n) => {
                      setNumPages(n);
                      setPage((p) => Math.min(Math.max(1, p), n));
                    }}
                  />
                </div>
                <AnnotateOverlay
                  page={page}
                  strokes={strokes[page] ?? []}
                  onCommitStroke={commitStroke}
                  annotate={annotate}
                />

              </div>
            </div>
          )
        ) : (
          <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-emerald-400">Honesty Tracker</p>
            <h2 className="text-2xl font-black">{item.name}</h2>
            <p className="text-sm text-white/70">
              No file attached. Open your physical book, complete a focused session, then run a recall to advance the revision tier.
            </p>
            {track && (
              <Link
                to="/recall/$itemId"
                params={{ itemId: track.id }}
                className="mt-2 inline-flex items-center gap-2 rounded-full bg-accent-amber px-4 py-2 text-[11px] font-black uppercase tracking-[0.2em] text-accent-amber-foreground"
              >
                <Sparkles className="h-3.5 w-3.5" /> Open Recall
              </Link>
            )}
          </div>
        )}
      </div>

      {/* Annotate toolbar (mirrors PremiumReader) */}
      {annotateOpen && isPdf && (
        <div className="absolute inset-x-0 bottom-[76px] z-30 mx-auto max-w-md px-4">
          <div className="mb-2 flex items-center justify-end gap-2">
            <button
              onClick={undo}
              disabled={!canUndo}
              className="grid h-9 w-9 place-items-center rounded-full bg-neutral-900/95 ring-1 ring-white/10 backdrop-blur disabled:opacity-30"
              aria-label="Undo"
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              className="grid h-9 w-9 place-items-center rounded-full bg-neutral-900/95 ring-1 ring-white/10 backdrop-blur disabled:opacity-30"
              aria-label="Redo"
            >
              <Redo2 className="h-4 w-4" />
            </button>
          </div>
          <div className="rounded-2xl bg-neutral-900/95 p-3 shadow-2xl ring-1 ring-white/10 backdrop-blur">
            <div className="mb-2 flex items-center gap-2">
              <button
                onClick={() => setTool("pen")}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold",
                  tool === "pen" ? "bg-accent-amber text-accent-amber-foreground" : "bg-white/10 text-white/80",
                )}
              >
                <Pen className="h-3.5 w-3.5" /> Pen
              </button>
              <button
                onClick={() => setTool("eraser")}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold",
                  tool === "eraser" ? "bg-accent-amber text-accent-amber-foreground" : "bg-white/10 text-white/80",
                )}
              >
                <Eraser className="h-3.5 w-3.5" /> Eraser
              </button>
              <button
                onClick={() => clearPage(page)}
                className="ml-auto rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-medium text-white/80"
              >
                Clear
              </button>
              <button
                onClick={() => setAnnotateOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-full bg-white/10"
                aria-label="Close annotate"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mb-2 flex items-center gap-3">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-white/50">Size</span>
              <Slider
                value={[size]}
                min={1}
                max={24}
                step={1}
                onValueChange={(v) => setSize(v[0] ?? 4)}
                className="flex-1"
              />
              <span className="w-6 text-right text-xs tabular-nums text-white/70">{size}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => {
                    setColor(c);
                    setTool("pen");
                  }}
                  aria-label={`Color ${c}`}
                  className={cn(
                    "h-6 w-6 rounded-full ring-1 ring-white/20 transition-transform",
                    color === c && tool === "pen" && "scale-125 ring-2 ring-accent-amber",
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* View Mode panel */}
      {viewOpen && (
        <>
          <div className="absolute inset-0 z-40 bg-black/60" onClick={() => setViewOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 z-50 mx-auto max-w-md rounded-t-3xl bg-neutral-950 p-5 pb-[calc(env(safe-area-inset-bottom)+20px)] shadow-2xl ring-1 ring-white/10">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold">View Mode</h3>
              <button
                onClick={() => setViewOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-full bg-white/10"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <Section label="Reading Direction">
              <Segmented
                value={direction}
                onChange={(v) => setDirection(v as Direction)}
                options={[
                  { value: "horizontal", label: "Horizontal" },
                  { value: "vertical", label: "Vertical" },
                ]}
              />
            </Section>
            <Section label="Background">
              <Segmented
                value={background}
                onChange={(v) => setBackground(v as Background)}
                options={[
                  { value: "original", label: "Original" },
                  { value: "invert", label: "Invert" },
                ]}
              />
            </Section>
          </div>
        </>
      )}

      {/* Bottom bar — mirrors the Premium reader shell */}
      {isPdf && (
        <div
          className={cn(
            "absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/90 to-transparent px-3 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-6 transition-transform",
            barOpen ? "translate-y-0" : "translate-y-full",
          )}
        >
          <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-center gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); setPage((p) => Math.max(1, p - 1)); }}
              disabled={page === 1}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 disabled:opacity-30"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <input
              type="range"
              min={1}
              max={Math.max(1, numPages)}
              value={page}
              onChange={(e) => setPage(Number(e.target.value))}
              onClick={(e) => e.stopPropagation()}
              className="min-w-0 flex-1 basis-40 accent-[oklch(0.78_0.14_78)]"
              aria-label="Page scrubber"
            />
            <button
              onClick={(e) => { e.stopPropagation(); setPage((p) => Math.min(numPages, p + 1)); }}
              disabled={page >= numPages}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 disabled:opacity-30"
              aria-label="Next page"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <PageSearch total={Math.max(1, numPages)} onGo={(p) => setPage(p)} />
            <button
              onClick={(e) => { e.stopPropagation(); setViewOpen(true); setAnnotateOpen(false); }}
              className="flex shrink-0 items-center gap-1 rounded-full bg-white/10 px-3 py-2 text-[11px] font-semibold"
            >
              <Settings2 className="h-3.5 w-3.5" /> View
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setAnnotateOpen((v) => !v); }}
              className={cn(
                "flex shrink-0 items-center gap-1 rounded-full px-3 py-2 text-[11px] font-bold",
                annotateOpen ? "bg-accent-amber text-accent-amber-foreground" : "bg-white/10 text-white",
              )}
            >
              <PencilLine className="h-3.5 w-3.5" /> Annotate
            </button>
          </div>
        </div>
      )}

      {recall.completed && (
        <ReaderCompletionOverlay
          claimed={recall.claimed}
          onClaim={recall.claim}
          onAddTime={recall.addTime}
          onExit={recall.exit}
        />
      )}
    </div>
  );
}

/**
 * PageSearch — "Search" control in the reader bottom bar. Jumps to a page number.
 */
function PageSearch({ total, onGo }: { total: number; onGo: (page: number) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const go = () => {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 1) onGo(Math.min(total, Math.round(n)));
    setOpen(false);
    setValue("");
  };
  return (
    <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
      {open && (
        <div className="absolute bottom-11 right-0 flex items-center gap-1 rounded-full bg-neutral-900/95 p-1 ring-1 ring-white/10">
          <input
            autoFocus
            inputMode="numeric"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") go(); }}
            placeholder={`1-${total}`}
            className="w-20 bg-transparent px-2 text-[11px] text-white outline-none placeholder:text-white/40"
            aria-label="Go to page"
          />
          <button onClick={go} className="rounded-full bg-accent-amber px-2.5 py-1 text-[10px] font-black uppercase text-accent-amber-foreground">
            Go
          </button>
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-2 text-[11px] font-semibold"
      >
        <Search className="h-3.5 w-3.5" /> Search
      </button>
    </div>
  );
}

/**
 * useAnnotations — global (per-reader) annotation store keyed by page index,
 * plus a UNIFIED undo/redo history that spans every page. Because the history
 * records which page each stroke belongs to, undo/redo behave identically in
 * horizontal (single page) and vertical (continuous scroll) layouts.
 */
function useAnnotations(pdfId?: string) {
  const storageKey = pdfId ? `pdf_annotations_${pdfId}` : null;
  const [strokes, setStrokes] = useState<Record<number, Stroke[]>>({});
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  // Load persisted strokes for this PDF on mount / id change.
  useEffect(() => {
    if (!storageKey) return;
    let next: Record<number, Stroke[]> = {};
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") next = parsed;
      }
    } catch {
      /* ignore corrupt payloads */
    }
    setStrokes(next);
    setLoadedKey(storageKey);
  }, [storageKey]);

  // Persist on every change (after the initial load for this key).
  useEffect(() => {
    if (!storageKey || loadedKey !== storageKey) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(strokes));
    } catch {
      /* quota / private mode — drawing still works in-session */
    }
  }, [storageKey, loadedKey, strokes]);

  const [redoStack, setRedoStack] = useState<Record<number, Stroke[]>>({});
  const [history, setHistory] = useState<number[]>([]);
  const [redoHistory, setRedoHistory] = useState<number[]>([]);

  const commitStroke = useCallback((pageNum: number, s: Stroke) => {
    setStrokes((prev) => ({ ...prev, [pageNum]: [...(prev[pageNum] ?? []), s] }));
    setHistory((h) => [...h, pageNum]);
    // Any new drawing invalidates the redo history everywhere.
    setRedoStack({});
    setRedoHistory([]);
  }, []);

  const undo = useCallback(() => {
    if (!history.length) return;
    const p = history[history.length - 1];
    const list = strokes[p] ?? [];
    setHistory((h) => h.slice(0, -1));
    if (!list.length) return;
    const popped = list[list.length - 1];
    setStrokes((prev) => ({ ...prev, [p]: (prev[p] ?? []).slice(0, -1) }));
    setRedoStack((r) => ({ ...r, [p]: [...(r[p] ?? []), popped] }));
    setRedoHistory((r) => [...r, p]);
  }, [history, strokes]);

  const redo = useCallback(() => {
    if (!redoHistory.length) return;
    const p = redoHistory[redoHistory.length - 1];
    const list = redoStack[p] ?? [];
    setRedoHistory((r) => r.slice(0, -1));
    if (!list.length) return;
    const popped = list[list.length - 1];
    setRedoStack((r) => ({ ...r, [p]: (r[p] ?? []).slice(0, -1) }));
    setStrokes((prev) => ({ ...prev, [p]: [...(prev[p] ?? []), popped] }));
    setHistory((h) => [...h, p]);
  }, [redoHistory, redoStack]);

  const clearPage = useCallback((pageNum: number) => {
    setStrokes((prev) => ({ ...prev, [pageNum]: [] }));
    setRedoStack((r) => ({ ...r, [pageNum]: [] }));
    setHistory((h) => h.filter((p) => p !== pageNum));
    setRedoHistory((r) => r.filter((p) => p !== pageNum));
  }, []);

  return {
    strokes,
    commitStroke,
    undo,
    redo,
    clearPage,
    canUndo: history.length > 0,
    canRedo: redoHistory.length > 0,
  };
}

/**
 * AnnotateOverlay — transparent canvas layered above the real PDF page.
 * Stays mounted even when the toolbar is closed so drawings persist; it only
 * captures pointer events while `active` is true.
 */
function AnnotateOverlay({
  page,
  strokes,
  onCommitStroke,
  annotate,
}: {
  page: number;
  strokes: Stroke[];
  onCommitStroke: (page: number, s: Stroke) => void;
  annotate: AnnotateSettings;
}) {

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef<Stroke | null>(null);
  const drawingPointerId = useRef<number | null>(null);

  /**
   * Anchor the overlay to the ACTUAL rendered PDF page canvas rather than the
   * wrapper box. In horizontal mode the wrapper is wider/taller than the page,
   * which previously made every stroke drift. Strokes are stored as fractions
   * of the page box, so once the overlay matches the page rect exactly they
   * stay glued to the same text at any zoom or resolution.
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    let raf = 0;
    const sync = () => {
      const pdfCanvas = Array.from(parent.querySelectorAll("canvas")).find(
        (c) => c !== canvas,
      ) as HTMLCanvasElement | undefined;
      if (!pdfCanvas) return;
      const pr = parent.getBoundingClientRect();
      const cr = pdfCanvas.getBoundingClientRect();
      if (!cr.width || !cr.height) return;
      canvas.style.left = `${cr.left - pr.left}px`;
      canvas.style.top = `${cr.top - pr.top}px`;
      canvas.style.width = `${cr.width}px`;
      canvas.style.height = `${cr.height}px`;
    };
    const schedule = () => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(sync);
    };
    schedule();
    const ro = new ResizeObserver(schedule);
    ro.observe(parent);
    const mo = new MutationObserver(schedule);
    mo.observe(parent, { childList: true, subtree: true, attributes: true });
    window.addEventListener("resize", schedule);
    const iv = window.setInterval(sync, 500);
    return () => {
      window.cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", schedule);
      window.clearInterval(iv);
    };
  }, []);



  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const logicalW = canvas.offsetWidth;
    const logicalH = canvas.offsetHeight;
    if (logicalW === 0 || logicalH === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const targetW = Math.max(1, Math.floor(logicalW * dpr));
    const targetH = Math.max(1, Math.floor(logicalH * dpr));
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, logicalW, logicalH);
    const paint = (s: Stroke) => {
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.lineWidth = Math.max(0.5, s.sizeFrac * logicalW);
      if (s.mode === "eraser") {
        ctx.globalCompositeOperation = "destination-out";
        ctx.strokeStyle = "rgba(0,0,0,1)";
      } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = s.color;
      }
      if (s.points.length === 1) {
        const p = s.points[0];
        ctx.beginPath();
        ctx.arc(p.x * logicalW, p.y * logicalH, Math.max(0.5, (s.sizeFrac * logicalW) / 2), 0, Math.PI * 2);
        ctx.fillStyle = s.mode === "eraser" ? "rgba(0,0,0,1)" : s.color;
        ctx.fill();
      } else {
        ctx.beginPath();
        s.points.forEach((p, i) => {
          const px = p.x * logicalW;
          const py = p.y * logicalH;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";
    };
    for (const s of strokes) paint(s);
    if (drawingRef.current) paint(drawingRef.current);
  }, [strokes]);

  useEffect(() => { redraw(); }, [redraw]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => redraw());
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [redraw]);

  const pointerFrac = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: (clientX - rect.left) / rect.width, y: (clientY - rect.top) / rect.height };
  };

  return (
    <canvas
      ref={canvasRef}
      className="absolute left-0 top-0"

      style={{
        touchAction: "none",
        pointerEvents: annotate.active ? "auto" : "none",
        cursor: annotate.tool === "eraser" ? "cell" : "crosshair",
      }}
      onPointerDown={(e) => {
        if (!annotate.active) return;

        (e.currentTarget as HTMLCanvasElement).setPointerCapture?.(e.pointerId);
        drawingPointerId.current = e.pointerId;
        const w = canvasRef.current?.offsetWidth ?? 1;
        drawingRef.current = {
          color: annotate.color,
          sizeFrac: annotate.size / Math.max(1, w),
          mode: annotate.tool,
          points: [pointerFrac(e.clientX, e.clientY)],
        };
        redraw();
      }}
      onPointerMove={(e) => {
        if (drawingPointerId.current !== e.pointerId || !drawingRef.current) return;
        drawingRef.current.points.push(pointerFrac(e.clientX, e.clientY));
        redraw();
      }}
      onPointerUp={(e) => {
        if (drawingPointerId.current !== e.pointerId) return;
        const s = drawingRef.current;
        drawingRef.current = null;
        drawingPointerId.current = null;
        if (s) onCommitStroke(page, s);
      }}
      onPointerCancel={() => {
        drawingRef.current = null;
        drawingPointerId.current = null;
      }}
    />
  );
}




/**
 * PageStage — one zoomable + annotatable page.
 * - One-finger touch (or mouse) draws when annotate.active is true.
 * - Two-finger touch always pinch-zooms AND pans (centroid movement).
 * - The annotation canvas overlays the page and scales with the CSS transform,
 *   so drawn strokes stay glued to the underlying content while zooming.
 */
function PageStage({
  page,
  direction,
  strokes,
  onCommitStroke,
  annotate,
  nightModeFilter,
}: {
  page: number;
  direction: Direction;
  strokes: Stroke[];
  onCommitStroke: (page: number, s: Stroke) => void;
  annotate: AnnotateSettings;
  nightModeFilter: string;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef<Stroke | null>(null);
  const drawingPointerId = useRef<number | null>(null);

  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);

  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const gestureRef = useRef<{
    startDist: number;
    startScale: number;
    startTx: number;
    startTy: number;
    startCenter: { x: number; y: number };
  } | null>(null);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const logicalW = canvas.offsetWidth;
    const logicalH = canvas.offsetHeight;
    if (logicalW === 0 || logicalH === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const targetW = Math.max(1, Math.floor(logicalW * dpr));
    const targetH = Math.max(1, Math.floor(logicalH * dpr));
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, logicalW, logicalH);
    for (const s of strokes) drawStroke(ctx, s, logicalW, logicalH);
    if (drawingRef.current) drawStroke(ctx, drawingRef.current, logicalW, logicalH);
  }, [strokes]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => redraw());
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [redraw]);

  function drawStroke(
    ctx: CanvasRenderingContext2D,
    s: Stroke,
    w: number,
    h: number,
  ) {
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(0.5, s.sizeFrac * w);
    if (s.mode === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = s.color;
    }
    if (s.points.length === 1) {
      const p = s.points[0];
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, Math.max(0.5, (s.sizeFrac * w) / 2), 0, Math.PI * 2);
      ctx.fillStyle = s.mode === "eraser" ? "rgba(0,0,0,1)" : s.color;
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      return;
    }
    ctx.beginPath();
    s.points.forEach((p, i) => {
      const px = p.x * w;
      const py = p.y * h;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
  }

  function pointerFrac(clientX: number, clientY: number) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height,
    };
  }

  function centroid(pts: { x: number; y: number }[]) {
    const sx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
    const sy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
    return { x: sx, y: sy };
  }

  function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function beginPinch() {
    const pts = Array.from(pointersRef.current.values());
    if (pts.length < 2) return;
    const [p1, p2] = pts;
    gestureRef.current = {
      startDist: Math.max(1, dist(p1, p2)),
      startScale: scale,
      startTx: tx,
      startTy: ty,
      startCenter: centroid([p1, p2]),
    };
    // cancel any in-progress stroke
    drawingRef.current = null;
    drawingPointerId.current = null;
    redraw();
  }

  function startStroke(e: React.PointerEvent<HTMLDivElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const p = pointerFrac(e.clientX, e.clientY);
    const logicalW = canvas.offsetWidth;
    drawingPointerId.current = e.pointerId;
    drawingRef.current = {
      color: annotate.color,
      sizeFrac: annotate.size / Math.max(1, logicalW),
      mode: annotate.tool,
      points: [p],
    };
    redraw();
  }

  function onStagePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 2) {
      // Second finger — switch to pinch. Only capture for pinch to keep native
      // scroll available when idle.
      (e.currentTarget as HTMLDivElement).setPointerCapture?.(e.pointerId);
      beginPinch();
      return;
    }

    if (pointersRef.current.size === 1 && annotate.active) {
      (e.currentTarget as HTMLDivElement).setPointerCapture?.(e.pointerId);
      startStroke(e);
    }
  }

  function onStagePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size >= 2 && gestureRef.current) {
      const pts = Array.from(pointersRef.current.values()).slice(0, 2);
      const [p1, p2] = pts;
      const d = Math.max(1, dist(p1, p2));
      const ratio = d / gestureRef.current.startDist;
      const newScale = Math.max(
        MIN_SCALE,
        Math.min(MAX_SCALE, gestureRef.current.startScale * ratio),
      );
      const wrap = wrapRef.current;
      if (!wrap) return;
      const parentRect = wrap.parentElement!.getBoundingClientRect();
      const startCenterLocal = {
        x: gestureRef.current.startCenter.x - parentRect.left,
        y: gestureRef.current.startCenter.y - parentRect.top,
      };
      const nowCenter = centroid([p1, p2]);
      const nowCenterLocal = {
        x: nowCenter.x - parentRect.left,
        y: nowCenter.y - parentRect.top,
      };
      const panDx = nowCenterLocal.x - startCenterLocal.x;
      const panDy = nowCenterLocal.y - startCenterLocal.y;
      const scaleRatio = newScale / gestureRef.current.startScale;
      const newTx =
        gestureRef.current.startTx -
        (startCenterLocal.x - gestureRef.current.startTx) * (scaleRatio - 1) +
        panDx;
      const newTy =
        gestureRef.current.startTy -
        (startCenterLocal.y - gestureRef.current.startTy) * (scaleRatio - 1) +
        panDy;
      setScale(newScale);
      setTx(newTx);
      setTy(newTy);
      return;
    }

    if (
      drawingRef.current &&
      drawingPointerId.current === e.pointerId &&
      pointersRef.current.size === 1
    ) {
      drawingRef.current.points.push(pointerFrac(e.clientX, e.clientY));
      redraw();
    }
  }

  function endPointer(e: React.PointerEvent<HTMLDivElement>) {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) gestureRef.current = null;

    if (drawingPointerId.current === e.pointerId) {
      const s = drawingRef.current;
      drawingRef.current = null;
      drawingPointerId.current = null;
      if (s) onCommitStroke(page, s);
    }

    if (pointersRef.current.size === 0 && scale <= 1.01) {
      setScale(1);
      setTx(0);
      setTy(0);
    }
  }

  // touch-action: enable native vertical scroll in vertical mode when NOT
  // annotating. Block all native gestures while annotating so the pen owns
  // touch. Horizontal mode never scrolls, so touch-none is fine.
  const touchAction = annotate.active
    ? "none"
    : direction === "vertical"
      ? "pan-y"
      : "none";

  return (
    <div
      className="relative"
      style={{ width: "min(100%, 28rem)", aspectRatio: "3 / 4", touchAction }}
      onPointerDown={onStagePointerDown}
      onPointerMove={onStagePointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
    >
      <div
        ref={wrapRef}
        className="absolute inset-0"
        style={{
          transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
          transformOrigin: "0 0",
          transition: gestureRef.current ? "none" : "transform 120ms ease-out",
          willChange: "transform",
        }}
      >
        <div className="absolute inset-0" style={{ filter: nightModeFilter }}>
          <PageCard page={page} />
        </div>
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
          style={{ pointerEvents: "none" }}
        />
      </div>
    </div>
  );
}

function PageCard({ page }: { page: number }) {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl bg-white text-neutral-900 shadow-2xl">
      <div className="flex h-full flex-col gap-3 p-6">
        <h2 className="text-lg font-bold text-red-700">Chapter {page}</h2>
        <p className="text-sm">
          Electric field intensity at a point due to a point charge is defined as the
          <span className="text-blue-700"> force experienced per unit </span>
          positive test charge placed at that point.
        </p>
        <div className="mt-2 rounded-md bg-yellow-100 p-3 text-xs">
          <span className="font-semibold">Tip:</span> Remember E = F/q, direction along F on +q.
        </div>
        <div className="mt-auto text-right text-[10px] text-neutral-500">Page {page}</div>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/50">
        {label}
      </p>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-full bg-white/5 p-1 ring-1 ring-white/10">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-full py-2 text-xs font-semibold transition-colors",
            value === o.value
              ? "bg-accent-amber text-accent-amber-foreground"
              : "text-white/70",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Row({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-3 ring-1 ring-white/10">
      <span className="text-sm">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
