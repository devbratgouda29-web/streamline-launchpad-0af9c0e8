import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Home,
  Settings2,
  Sparkles,
  Timer,
  Search,
  X,
} from "lucide-react";
import { RecallTimerBadge } from "@/components/RecallTimerBadge";
import { TierBadge } from "@/components/TierBadge";
import { Switch } from "@/components/ui/switch";
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
      { name: "description", content: "Read your purchased note pack in a distraction-free reader." },
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

type Direction = "horizontal" | "vertical";
type Background = "original" | "invert";


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
  const [isControlsVisible, setIsControlsVisible] = useState(true);
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


  useEffect(() => {
    const onVis = () => setBlurred(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const next = () => setPage((p) => Math.min(totalPages, p + 1));
  const prev = () => setPage((p) => Math.max(1, p - 1));

  const nightModeFilter = background === "invert" ? "invert(1) hue-rotate(180deg)" : "none";



  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black text-white"
      onContextMenu={(e) => e.preventDefault()}
      style={{ userSelect: "none", WebkitUserSelect: "none" }}
    >
      {/* Top bar */}
      <div
        className={cn(
          "absolute inset-x-0 top-0 z-20 flex items-center gap-3 bg-gradient-to-b from-black/90 to-transparent px-4 pb-6 pt-3 transition-all duration-300 ease-out",
          isControlsVisible ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0 pointer-events-none",
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
        onClick={() => setIsControlsVisible((v) => !v)}
      >
        {pdfUrl ? (
          direction === "vertical" ? (
            <div className="absolute inset-0 overflow-y-auto">
              <div
                className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4 p-4"
                style={{ filter: nightModeFilter }}
              >
                {Array.from({ length: totalPages }, (_, i) => (
                  <div key={i} className="relative w-full">
                    <PdfViewer
                      src={pdfUrl}
                      name={note?.title ?? "note"}
                      className="w-full"
                      hideControls
                      page={i + 1}
                      onNumPages={(n) => setPdfPages(n)}
                    />

                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex snap-x snap-mandatory items-center overflow-x-auto p-4">
              <div
                className="relative mx-auto flex h-full w-full max-w-3xl shrink-0 snap-center items-center justify-center"
                style={{ filter: nightModeFilter }}
              >
                <PdfViewer
                  src={pdfUrl}
                  name={note?.title ?? "note"}
                  className="h-full w-full"
                  hideControls
                  page={page}
                  onNumPages={(n) => setPdfPages(n)}
                  onPageChange={(p) => setPage(p)}
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
              <PageStage page={page} nightModeFilter={nightModeFilter} />
            </div>
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4 p-4">
            {Array.from({ length: totalPages }, (_, i) => (
              <PageStage key={i} page={i + 1} nightModeFilter={nightModeFilter} />
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
          "absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/90 to-transparent px-3 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-6 transition-all duration-300 ease-out",
          isControlsVisible ? "translate-y-0 opacity-100" : "translate-y-full opacity-0 pointer-events-none",
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
          onClick={() => setViewOpen(true)}
          className="flex shrink-0 items-center gap-1 rounded-full bg-white/10 px-3 py-2 text-[11px] font-semibold"
        >
          <Settings2 className="h-3.5 w-3.5" /> View
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
          setBarOpen((v) => !v);
        }}
      >
        {isPdf ? (
          direction === "vertical" ? (
            <div
              className="absolute inset-0 overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4 p-4"
                style={{ filter: nightModeFilter }}
              >
                {Array.from({ length: numPages }, (_, i) => (
                  <div key={i} className="relative w-full">
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
                ))}
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex snap-x snap-mandatory items-center overflow-x-auto p-4">
              <div
                className="relative mx-auto flex h-full w-full max-w-3xl shrink-0 snap-center items-center justify-center"
                onClick={(e) => e.stopPropagation()}
                style={{ filter: nightModeFilter }}
              >
                <PdfViewer
                  src={pdfBlobUrl!}
                  name={item.name}
                  className="h-full w-auto max-w-full"
                  hideControls
                  page={page}
                  onNumPages={(n) => {
                    setNumPages(n);
                    setPage((p) => Math.min(Math.max(1, p), n));
                  }}
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
              onClick={(e) => { e.stopPropagation(); setViewOpen(true); }}
              className="flex shrink-0 items-center gap-1 rounded-full bg-white/10 px-3 py-2 text-[11px] font-semibold"
            >
              <Settings2 className="h-3.5 w-3.5" /> View
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






/** PageStage — a single placeholder page rendered on the dark reader backdrop. */
function PageStage({ page, nightModeFilter }: { page: number; nightModeFilter: string }) {
  return (
    <div className="relative" style={{ width: "min(100%, 28rem)", aspectRatio: "3 / 4" }}>
      <div className="absolute inset-0" style={{ filter: nightModeFilter }}>
        <PageCard page={page} />
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
