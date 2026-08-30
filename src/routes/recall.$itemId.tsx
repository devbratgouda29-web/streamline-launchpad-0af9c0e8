import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Ghost, Skull, Sparkles, Timer, Hammer, FastForward, BookOpen, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getItem,
  restoreItem,
  advanceOnClaim,
  setDifficulty as lockDifficulty,
  type RevisionItem,
} from "@/lib/revision-engine";
import { recordRevisionSession } from "@/lib/revision-logs";

import { getDeskItem, type DeskItem } from "@/lib/desk-store";
import { dataUrlToBlobUrl } from "@/lib/pdf-blob";
import { PdfViewer } from "@/components/PdfViewer";
import {
  clearSession,
  ensureSession,
  markCompleted,
  setPlaying as setSessionPlaying,
  setRemaining as writeRemaining,
  subscribe as subscribeSession,
  type RecallSession,
} from "@/lib/recall-session";

export const Route = createFileRoute("/recall/$itemId")({
  head: () => ({
    meta: [
      { title: "Obligatory Recall — From The Last Bench" },
      {
        name: "description",
        content: "10-minute accountability recall session.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RecallPage,
});

function format(ms: number) {
  if (ms <= 0) return "00:00";
  const s = Math.floor(ms / 1000);
  const m = String(Math.floor(s / 60)).padStart(2, "0");
  const r = String(s % 60).padStart(2, "0");
  return `${m}:${r}`;
}

function RecallPage() {
  const { itemId } = Route.useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState<RevisionItem | null>(null);
  const [deskFile, setDeskFile] = useState<DeskItem | null>(null);
  const [session, setSession] = useState<RecallSession | null>(null);
  const durationMs = session?.durationMs ?? 30 * 60 * 1000;
  const remaining = session?.remainingMs ?? durationMs;
  const durationMinutes = Math.round(durationMs / 60000);
  const locked = remaining > 0 && !session?.completed;

  useEffect(() => {
    const it = getItem(itemId);
    setItem(it);
    if (it?.sourceId && it.sourceId.startsWith("desk-")) {
      setDeskFile(getDeskItem(it.sourceId));
    }
  }, [itemId]);

  // Initialize (or resume) the shared recall session. Timer does NOT tick on
  // this screen — it only ticks inside the PDF reader while playing.
  useEffect(() => {
    if (!item) return;
    const s = ensureSession({
      itemId,
      sourceId: item.sourceId ?? itemId,
      isDebt: !!item.fractured,
      tier: item.tier,
      loopCount: item.loopCount ?? 0,
    });
    setSession(s);
    const unsub = subscribeSession((next) => setSession(next));
    return () => unsub();
  }, [itemId, item]);

  // Auto-pause any running timer when leaving this screen.
  useEffect(() => () => setSessionPlaying(false), []);

  const bypass = () => {
    writeRemaining(0);
    markCompleted();
  };

  // Listen for the global floating "Dev Pass" bypass so this locked screen
  // also releases its own timer flag when the developer bypasses lockdown.
  useEffect(() => {
    const onBypass = () => bypass();
    window.addEventListener("devpass:bypass", onBypass);
    return () => window.removeEventListener("devpass:bypass", onBypass);
  }, []);

  // Convert stored data: PDF into an inline-renderable blob: URL. Some
  // browsers refuse to render `data:application/pdf` inside an <iframe>
  // and would otherwise trigger a native download instead of inline view.
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  useEffect(() => {
    setPdfBlobUrl(null);
    if (deskFile?.kind === "pdf" && deskFile.dataUrl) {
      const url = dataUrlToBlobUrl(deskFile.dataUrl);
      setPdfBlobUrl(url);
      return () => { if (url.startsWith("blob:")) URL.revokeObjectURL(url); };
    }
  }, [deskFile?.id, deskFile?.kind, deskFile?.dataUrl]);

  const submit = (difficulty: "hard" | "easy") => {
    if (item?.fractured) {
      // Debt recall: repair the fracture, tier stays where it was.
      restoreItem(itemId, difficulty);
    } else {
      // Completing a recall session ALWAYS advances the tier (1 → 2 → … → 5),
      // awards the badge and mirrors the session to the backend log.
      if (item?.lockedDifficulty !== difficulty) lockDifficulty(itemId, difficulty);
      recordRevisionSession({
        itemId,
        chapterName: item?.name ?? "Chapter",
        subject: "",
        totalMs: Math.max(0, durationMs - remaining),
        baseMs: durationMs,
        overtimeMs: 0,
      });
      advanceOnClaim(itemId);
    }
    clearSession();
    navigate({ to: "/home" });
  };



  if (!item) {
    return (
      <div className="min-h-screen bg-background px-5 py-10">
        <p className="text-sm text-muted-foreground">This recall target has vanished.</p>
        <Link to="/discipline/mission" className="mt-4 inline-flex items-center gap-1 text-sm text-accent-amber">
          <ArrowLeft className="h-4 w-4" /> Return to mission
        </Link>
      </div>
    );
  }

  const pct = Math.min(100, ((durationMs - remaining) / Math.max(1, durationMs)) * 100);
  const isPhysical = deskFile?.kind === "physical";
  const isPdf = deskFile?.kind === "pdf" && !!deskFile.dataUrl;
  
  const lockedDifficulty = item.lockedDifficulty; // undefined for legacy items

  const isDebt = !!item.fractured;
  const bgTint = isDebt
    ? "bg-[oklch(0.12_0.14_25)]"
    : "bg-[oklch(0.09_0.03_290)]";
  const accent = isDebt ? "text-destructive" : "text-purple-300";
  const chipBorder = isDebt ? "border-destructive/50 bg-destructive/10 text-destructive" : "border-purple-500/40 bg-purple-500/10 text-purple-300";

  return (
    <div className={`relative min-h-screen overflow-hidden ${bgTint} px-5 pb-16 pt-8 text-foreground`}>
      <button

        type="button"
        onClick={bypass}
        className="absolute right-3 top-3 z-20 inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300/90 backdrop-blur hover:bg-amber-400/25"
        title="Dev bypass — instantly unlock this recall for testing"
      >
        <FastForward className="h-3 w-3" /> [ Dev Pass: Bypass Lockdown ]
      </button>

      <div className="pointer-events-none absolute inset-0 opacity-40" style={{
        background:
          isDebt
            ? "radial-gradient(circle at 20% 10%, oklch(0.5 0.28 25 / 0.5), transparent 60%), radial-gradient(circle at 80% 90%, oklch(0.35 0.22 15 / 0.55), transparent 60%)"
            : "radial-gradient(circle at 20% 10%, oklch(0.35 0.15 300 / 0.35), transparent 60%), radial-gradient(circle at 80% 90%, oklch(0.3 0.15 20 / 0.35), transparent 60%)",
      }} />

      <div className="relative">
        <div className="mb-6 flex items-center justify-between">
          <span className={`inline-flex items-center gap-2 rounded-full border ${chipBorder} px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em]`}>
            {isDebt ? <Hammer className="h-3.5 w-3.5" /> : <Ghost className="h-3.5 w-3.5" />}
            {isDebt ? "Debt Recall · Restoration" : "Obligatory Recall"}
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
            <Skull className="h-3.5 w-3.5" /> Locked · {locked ? "Active" : "Released"}
          </span>
        </div>

        <h1 className="text-3xl font-black uppercase leading-tight tracking-tight">
          {item.name}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {isDebt
            ? `Midnight passed. The shield fractured. Sit for ${durationMinutes} uninterrupted minutes to forge it anew — lockdown lifts on completion.`
            : `The forgetting curve came for this one. Sit with it for ${durationMinutes} minutes. No exits, no shortcuts — only recall.`}
        </p>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-2">
          {isPdf && item.sourceId ? (
            <Link
              to="/reader/$noteId"
              params={{ noteId: item.sourceId }}
              search={{ mode: "recall" }}
              className="inline-flex items-center gap-2 rounded-xl border border-purple-400/40 bg-purple-500/15 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-purple-100 hover:bg-purple-500/25"
            >
              <BookOpen className="h-4 w-4" /> Open Chapter PDF
            </Link>
          ) : item.sourceId ? (
            <Link
              to="/reader/$noteId"
              params={{ noteId: item.sourceId }}
              search={{ mode: "recall" }}
              className="inline-flex items-center gap-2 rounded-xl border border-purple-400/40 bg-purple-500/15 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-purple-100 hover:bg-purple-500/25"
            >
              <BookOpen className="h-4 w-4" /> Open Study Note
            </Link>
          ) : null}

          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Revise while the timer runs
          </span>
        </div>


        {isPhysical && (
          <div className="rounded-3xl border border-emerald-500/40 bg-emerald-500/5 p-5">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-500/20 text-emerald-300">
                <BookOpen className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300">Physical Honesty Log</p>
                <h2 className="text-xl font-black">{deskFile!.name}</h2>
              </div>
            </div>
            <ul className="mt-5 space-y-3 text-sm">
              {[
                "Open the book/notebook to the exact chapter.",
                "Close your eyes for 20 seconds — recall the section headings from memory.",
                "Read one page slowly, then look away and paraphrase it aloud.",
                "Write 3 questions the topic could pose in an exam.",
                "Answer them without peeking. Then verify.",
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-2 text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          </div>
        )}


        {/* RECALL PROTOCOL instruction box removed — timer + document take priority. */}

          </div>

          <div className="flex flex-col gap-4">

        <div className={`rounded-3xl border ${isDebt ? "border-destructive/40" : "border-purple-500/30"} bg-background/70 p-6 backdrop-blur`}>
          <div className="flex items-center gap-3">
            <Timer className={`h-5 w-5 ${accent}`} />
            <p className={`text-[10px] font-bold uppercase tracking-[0.2em] ${accent}`}>
              Accountability Countdown
            </p>
          </div>
          <p className={`mt-3 font-mono text-6xl font-black tabular-nums ${isDebt ? "text-destructive" : "text-purple-100"}`}>
            {format(remaining)}
          </p>
          <div className={`mt-4 h-2 w-full overflow-hidden rounded-full ${isDebt ? "bg-destructive/20" : "bg-purple-500/15"}`}>
            <div className={`h-full transition-all ${isDebt ? "bg-destructive" : "bg-gradient-to-r from-purple-400 to-fuchsia-500"}`}
                 style={{ width: `${pct}%` }} />
          </div>
          <p className={`mt-3 text-xs leading-relaxed ${isDebt ? "text-destructive/90" : "text-purple-200/90"}`}>
            Start reading the PDF for at least {durationMinutes} minutes to complete your recall session
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            Current Tier · <span className="font-bold text-foreground">T{item.tier}</span>
            {lockedDifficulty && (
              <span className={`ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-widest ${lockedDifficulty === "hard" ? "bg-destructive/15 text-destructive" : "bg-emerald-500/15 text-emerald-300"}`}>
                {lockedDifficulty === "hard" ? "Hard Mode · Locked" : "Easy Mode · Locked"}
              </span>
            )}
            {item.mastered && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-slate-200/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-100">
                <Sparkles className="h-3 w-3" /> Platinum Core
              </span>
            )}
          </p>
        </div>

        {lockedDifficulty ? (
          <Button
            disabled={locked}
            onClick={() => submit(lockedDifficulty)}
            className={`h-14 w-full rounded-2xl disabled:opacity-40 ${lockedDifficulty === "hard" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : "bg-emerald-500 text-black hover:bg-emerald-400"}`}
          >
            {isDebt
              ? `Restore · Complete ${lockedDifficulty === "hard" ? "Hard" : "Easy"} Recall`
              : `Complete ${lockedDifficulty === "hard" ? "Hard" : "Easy"} Recall`}
          </Button>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Button
              disabled={locked}
              onClick={() => submit("hard")}
              className="h-14 rounded-2xl bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-40"
            >
              {isDebt ? "Restore · Hard" : "Still Hard"}
            </Button>
            <Button
              disabled={locked}
              onClick={() => submit("easy")}
              className="h-14 rounded-2xl bg-emerald-500 text-black hover:bg-emerald-400 disabled:opacity-40"
            >
              {isDebt ? "Restore · Easy" : "Recalled Easy"}
            </Button>
          </div>
        )}
        {locked && (
          <p className={`mt-3 text-center text-[11px] uppercase tracking-[0.2em] ${isDebt ? "text-destructive/80" : "text-purple-300/80"}`}>
            Buttons unlock when the timer ends.
          </p>
        )}
        {lockedDifficulty && !locked && (
          <p className="text-center text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Difficulty is locked for this cycle. Change it only after all 5 tiers complete.
          </p>
        )}
          </div>
        </div>
      </div>
    </div>
  );
}