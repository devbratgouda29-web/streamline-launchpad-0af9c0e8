import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, Play, Brain, RotateCcw, Zap, Flame, Upload, PenSquare, Trash2, FileText } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ReviewStars } from "@/components/ReviewStars";
import {
  addItem,
  getItemBySource,
  progressPct,
  resetItem,
  resumeItem,
  subscribe as subscribeRevision,
  type RevisionItem,
} from "@/lib/revision-engine";
import {
  addPdf,
  addPhysical,
  listDesk,
  removeDesk,
  subscribeDesk,
  type DeskItem,
} from "@/lib/desk-store";
import { TierBadge, type TierNumber } from "@/components/TierBadge";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import {
  listNotes,
  listPurchasedNoteIds,
  noteMatchesLanguage,
  type Note,
  type ReadableLanguage,
} from "@/lib/notes-store";
import { supabase } from "@/integrations/supabase/client";
import { useLanguagePreference } from "@/lib/language-preference";
import { hasActiveSessionFor, subscribe as subscribeSession } from "@/lib/recall-session";


export const Route = createFileRoute("/_app/library")({
  head: () => ({
    meta: [
      { title: "My Library — From The Last Bench" },
      { name: "description", content: "Your purchased notes with reading progress and reviews." },
    ],
  }),
  component: LibraryPage,
});

type LibNote = {
  id: string;
  title: string;
  tag: string;
  progress: number;
  avgRating: number;
  reviews: number;
  note: Note & { cover_url: string | null };
};

function LibraryPage() {
  const { requireAuth } = useAuth();
  // Overdue/fracture penalties on badges clear as soon as a recall session for
  // that item is started, completed or bypassed.
  const [sessionTick, setSessionTick] = useState(0);
  useEffect(() => subscribeSession(() => setSessionTick((t) => t + 1)), []);
  const sessionTouched = (id: string) => {
    void sessionTick;
    return hasActiveSessionFor(id);
  };
  const [tab, setTab] = useState<"premium" | "desk">("premium");
  const [purchased, setPurchased] = useState<LibNote[]>([]);
  const [allNotes, setAllNotes] = useState<Note[]>([]);
  const [language] = useLanguagePreference();
  const purchasedRef = useRef<LibNote[]>([]);
  const [tracked, setTracked] = useState<Record<string, RevisionItem | null>>({});
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [desk, setDesk] = useState<DeskItem[]>([]);
  const [physicalName, setPhysicalName] = useState("");
  const [now, setNow] = useState(Date.now());
  const pdfRef = useRef<HTMLInputElement | null>(null);

  const visibleNotes = purchased.filter((n) => noteMatchesLanguage(n.note, language, allNotes));


  const refresh = () => {
    const map: Record<string, RevisionItem | null> = {};
    for (const n of purchasedRef.current) map[n.id] = getItemBySource(n.id);
    for (const d of listDesk()) map[d.id] = getItemBySource(d.id);
    setTracked(map);
    setDesk(listDesk());
  };

  // The Library shows ONLY packs the signed-in user has unlocked/purchased —
  // the full catalogue lives on the Home screen.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [notes, purchasedIds, { data: reviewRows }] = await Promise.all([
          listNotes(),
          listPurchasedNoteIds(),
          supabase.from("reviews").select("note_id, rating"),
        ]);
        if (!active) return;
        const stats = new Map<string, { sum: number; count: number }>();
        for (const r of reviewRows ?? []) {
          const s = stats.get(r.note_id) ?? { sum: 0, count: 0 };
          s.sum += r.rating;
          s.count += 1;
          stats.set(r.note_id, s);
        }
        const owned = new Set(purchasedIds);
        const mapped: LibNote[] = notes
          .filter((n) => owned.has(n.id))
          .map((n) => {
            const s = stats.get(n.id);
            return {
              id: n.id,
              title: n.title,
              tag: n.subject || (n.is_free ? "Free" : `₹${n.price_inr}`),
              progress: 0,
              avgRating: s && s.count ? s.sum / s.count : 0,
              reviews: s?.count ?? 0,
              note: {
                ...n,
                cover_url: n.cover_image_url || n.thumbnail_url || "/placeholder.svg",
              },
            };
  });
        setAllNotes(notes);
        purchasedRef.current = mapped;
        setPurchased(mapped);


        refresh();
      } catch {
        /* keep the empty state */
      }
    })();
    return () => {
      active = false;
    };
  }, []);


  useEffect(() => {
    refresh();
    const a = subscribeRevision(() => refresh());
    const b = subscribeDesk(() => refresh());
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      a(); b(); window.clearInterval(t);
    };
  }, []);


  const activate = (sourceId: string, title: string, difficulty: "hard" | "easy") => {
    if (!requireAuth("bookmark")) return;
    addItem(title, "chapter", { difficulty, sourceId });
    setPickerFor(null);
  };

  const relooп = (item: RevisionItem) => {
    resetItem(item.id, "easy");
  };

  const onPdf = (file: File) => {
    if (file.size > 6 * 1024 * 1024) {
      alert("PDF too large for local storage (max ~6MB). Try a smaller file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      addPdf(file.name.replace(/\.pdf$/i, "") || "Untitled PDF", String(reader.result));
    };
    reader.readAsDataURL(file);
  };

  const submitPhysical = () => {
    const t = physicalName.trim();
    if (!t) return;
    addPhysical(t);
    setPhysicalName("");
  };

  return (
    <div className="flex flex-col gap-6 px-5 pt-6">
      <header>
        <p className="text-xs font-medium text-accent-amber">Your collection</p>
        <h1 className="text-2xl">My Library</h1>
      </header>

      <div className="grid grid-cols-2 gap-2 rounded-full bg-card p-1 ring-1 ring-border">
        <button
          onClick={() => setTab("premium")}
          className={cn(
            "rounded-full py-2 text-[11px] font-black uppercase tracking-widest transition",
            tab === "premium" ? "bg-accent-amber text-accent-amber-foreground" : "text-muted-foreground",
          )}
        >
          Premium Notes
        </button>
        <button
          onClick={() => setTab("desk")}
          className={cn(
            "rounded-full py-2 text-[11px] font-black uppercase tracking-widest transition",
            tab === "desk" ? "bg-accent-amber text-accent-amber-foreground" : "text-muted-foreground",
          )}
        >
          My Desk
        </button>
      </div>


      {tab === "premium" && (visibleNotes.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl bg-card px-6 py-12 text-center ring-1 ring-border">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-primary/20 text-accent-amber">
            <BookOpen className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-base font-semibold">No notes unlocked yet</h2>
          <p className="mt-1 max-w-[260px] text-sm text-muted-foreground">
            {purchased.length === 0
              ? "No notes unlocked yet. Explore available packs on the Home screen!"
              : `No ${language === "hinglish" ? "Hinglish" : "English"} versions available yet.`}
          </p>
          <Link
            to="/home"
            className="mt-5 inline-flex items-center justify-center rounded-full bg-crimson-gradient px-5 py-2.5 text-[11px] font-black uppercase tracking-widest text-primary-foreground shadow-md"
          >
            Explore Note Packs
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {visibleNotes.map((n) => {

            const item = tracked[n.id] ?? null;
            const isPicking = pickerFor === n.id;
            const pct = item ? progressPct(item, now) : 0;
            // Shield ALWAYS reflects the most recently CLAIMED badge. No badge
            // is shown until the user completes a recall session and claims it.
            const shieldTier = item?.displayTier as TierNumber | undefined;
            const shieldLoop = item?.displayLoopCount ?? 0;
            return (
            <li key={n.id} className="rounded-2xl bg-card p-3 pt-2 ring-1 ring-border">
              <div className="flex gap-3">
                <div className="relative aspect-[3/4] w-20 shrink-0 overflow-hidden rounded-xl bg-muted">
                  {!n.note.cover_url || n.note.cover_url === "/placeholder.svg" ? (
                    <div className="grid h-full w-full place-items-center bg-crimson-gradient p-2 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className="line-clamp-2 text-[10px] font-bold uppercase leading-tight text-amber-400">
                          {n.title}
                        </span>
                        <div className="border-t border-white/10 pt-1 text-[8px] font-semibold uppercase tracking-wider text-zinc-300">
                          {n.note.subject || "NOTES"}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <img
                      src={n.note.cover_url}
                      alt=""
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  )}
                </div>                
                <div className="flex min-w-0 flex-1 flex-col justify-between">
                  <div>
                    <p className="min-w-0 truncate text-sm font-semibold">{n.title}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{n.tag}</p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <ReviewStars value={n.avgRating} size={12} />
                      <span className="text-[11px] text-muted-foreground">
                        {n.avgRating.toFixed(1)} ({n.reviews})
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-accent-amber"
                        style={{ width: `${n.progress}%` }}
                      />
                    </div>
                    <Link
                      to="/reader/$noteId"
                      params={{ noteId: n.id }}
                      search={{ mode: "standard" as const }}
                      className="grid h-8 w-8 place-items-center rounded-full bg-crimson-gradient text-primary-foreground"
                      aria-label={`Read ${n.title}`}
                    >
                      <Play className="h-3.5 w-3.5 fill-current" />
                    </Link>

                  </div>
                </div>
                {item && shieldTier && (
                  <div className="flex shrink-0 items-center self-stretch">
                    <TierBadge
                      tier={shieldTier}
                      size={144}
                      fractured={!!item.fractured && !sessionTouched(item.id)}
                      loopCount={shieldLoop}
                    />
                  </div>
                )}
              </div>

              {/* Automated Active Recall Tracking */}
              <div className="mt-3 rounded-xl border border-purple-500/30 bg-purple-500/5 p-3">
                {!item && !isPicking && (
                  <button
                    type="button"
                    onClick={() => setPickerFor(n.id)}
                    className="flex w-full items-center justify-between gap-3 text-left"
                  >
                    <span className="flex items-center gap-2">
                      <span className="grid h-8 w-8 place-items-center rounded-lg bg-purple-500/15 text-purple-300">
                        <Brain className="h-4 w-4" />
                      </span>
                      <span>
                        <span className="block text-[12px] font-bold uppercase tracking-wide text-purple-200">
                          Activate Automated Active Recall Tracking
                        </span>
                        <span className="block text-[10px] text-muted-foreground">
                          Spaced repetition · 5 tiers to Platinum Core
                        </span>
                      </span>
                    </span>
                    <span className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full bg-muted">
                      <span className="ml-0.5 h-5 w-5 rounded-full bg-background shadow" />
                    </span>
                  </button>
                )}

                {!item && isPicking && (
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-purple-200">
                      How well do you know this chapter?
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      Sets your baseline interval. The engine handles the rest.
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => activate(n.id, n.title, "hard")}
                        className="flex flex-col items-start gap-0.5 rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 text-left hover:bg-destructive/15"
                      >
                        <span className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-destructive">
                          <Flame className="h-3.5 w-3.5" /> Hard / Shaky
                        </span>
                        <span className="text-[10px] text-muted-foreground">Recall in 12 hours</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => activate(n.id, n.title, "easy")}
                        className="flex flex-col items-start gap-0.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-2.5 text-left hover:bg-emerald-500/15"
                      >
                        <span className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-emerald-400">
                          <Zap className="h-3.5 w-3.5" /> Easy / Strong
                        </span>
                        <span className="text-[10px] text-muted-foreground">Recall in 24 hours</span>
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPickerFor(null)}
                      className="mt-2 text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {item && item.paused && (
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="grid h-7 w-7 place-items-center rounded-lg bg-white/10 text-white/70">
                        <Brain className="h-3.5 w-3.5" />
                      </span>
                      <span className="text-[11px] font-bold uppercase tracking-wide text-white/70">
                        Tracking Paused · {item.highestBadge ?? "Badges preserved"}
                      </span>
                    </div>
                    <p className="mt-2 text-[10px] text-muted-foreground">
                      Resume to start a fresh loop from Level 1 (Bronze Core
                      {item.loopCount ? ` x${(item.loopCount ?? 0) + 1}` : ""}). All earned badges stay.
                    </p>
                    <button
                      type="button"
                      onClick={() => resumeItem(item.id, item.lockedDifficulty ?? "easy")}
                      className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-purple-500 to-fuchsia-500 px-3 py-2 text-[11px] font-black uppercase tracking-widest text-white hover:opacity-90"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Resume Tracking
                    </button>
                  </div>
                )}

                {item && !item.paused && (
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2">
                        <span className="grid h-7 w-7 place-items-center rounded-lg bg-purple-500/15 text-purple-300">
                          <Brain className="h-3.5 w-3.5" />
                        </span>
                        <span className="text-[11px] font-bold uppercase tracking-wide text-purple-200">
                          {item.fractured ? "FRACTURED · Restore required" : `Tracking Active · Level ${item.displayTier ?? 0}/5`}
                        </span>
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={item.fractured ? "h-full bg-destructive/70" : "h-full bg-gradient-to-r from-purple-400 to-fuchsia-500"}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    {item.fractured ? (
                      <Link
                        to="/recall/$itemId"
                        params={{ itemId: item.id }}
                        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-destructive px-3 py-2 text-[11px] font-black uppercase tracking-widest text-destructive-foreground"
                      >
                        Enter Restoration Recall
                      </Link>
                    ) : pct >= 100 ? (
                      <Link
                        to="/recall/$itemId"
                        params={{ itemId: item.id }}
                        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-purple-500 to-fuchsia-500 px-3 py-2 text-[11px] font-black uppercase tracking-widest text-white"
                      >
                        <Brain className="h-3.5 w-3.5" /> Recall Now · Overdue
                      </Link>
                    ) : item.mastered ? (
                      <button
                        type="button"
                        onClick={() => relooп(item)}
                        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-purple-500 to-fuchsia-500 px-3 py-2 text-[11px] font-black uppercase tracking-widest text-white hover:opacity-90"
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> Initiate Re-Recall Cycle
                      </button>
                    ) : (
                      <p className="mt-2 text-[10px] text-muted-foreground">
                        Next recall: {new Date(item.nextDueAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </li>
            );
          })}
        </ul>
      ))}

      {tab === "desk" && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <input
              ref={pdfRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onPdf(f);
                if (pdfRef.current) pdfRef.current.value = "";
              }}
            />
            <button
              onClick={() => pdfRef.current?.click()}
              className="flex flex-col items-start gap-1 rounded-2xl border border-accent-amber/50 bg-accent-amber/5 p-3 text-left"
            >
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent-amber/20 text-accent-amber">
                <Upload className="h-4 w-4" />
              </span>
              <span className="text-[12px] font-black uppercase tracking-widest text-accent-amber">Upload PDF</span>
              <span className="text-[10px] text-muted-foreground">Any personal PDF · full engine</span>
            </button>
            <div className="flex flex-col gap-1 rounded-2xl border border-emerald-500/40 bg-emerald-500/5 p-3">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500/15 text-emerald-300">
                <PenSquare className="h-4 w-4" />
              </span>
              <span className="text-[12px] font-black uppercase tracking-widest text-emerald-300">Physical Log</span>
              <span className="text-[10px] text-muted-foreground">Honesty-based tracker</span>
              <div className="mt-1 flex items-center gap-1">
                <input
                  value={physicalName}
                  onChange={(e) => setPhysicalName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitPhysical()}
                  placeholder="e.g. NCERT Physics Ch 5"
                  className="min-w-0 flex-1 rounded-md bg-background px-2 py-1 text-[11px] ring-1 ring-border outline-none"
                />
                <button onClick={submitPhysical} className="rounded-md bg-emerald-500 px-2 py-1 text-[10px] font-black text-black">
                  Log
                </button>
              </div>
            </div>
          </div>

          {desk.length === 0 ? (
            <div className="rounded-2xl bg-card p-8 text-center ring-1 ring-border">
              <p className="text-sm font-semibold text-foreground">No documents uploaded yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Upload a PDF or log a physical book to start tracking.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {desk.map((d) => {
                const item = tracked[d.id] ?? null;
                const isPicking = pickerFor === d.id;
                const pct = item ? progressPct(item, now) : 0;
                const shieldTier = item?.displayTier as TierNumber | undefined;
                const shieldLoop = item?.displayLoopCount ?? 0;
                return (
                  <li key={d.id} className="rounded-2xl bg-card p-3 ring-1 ring-border">
                    <div className="flex items-center gap-3">
                      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-crimson-gradient text-primary-foreground">
                        {d.kind === "pdf" ? <FileText className="h-5 w-5" /> : <PenSquare className="h-5 w-5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{d.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {d.kind === "pdf" ? "Uploaded PDF" : "Physical · Honesty tracker"}
                        </p>
                      </div>
                      {item && shieldTier && (
                        <div className="flex shrink-0 items-center self-stretch">
                          <TierBadge
                            tier={shieldTier}
                            size={144}
                            fractured={!!item.fractured && !sessionTouched(item.id)}
                            loopCount={shieldLoop}
                          />
                        </div>
                      )}


                      {d.kind === "pdf" && (
                        <Link
                          to="/reader/$noteId"
                          params={{ noteId: d.id }} search={{ mode: "standard" as const }}
                          className="grid h-8 w-8 place-items-center rounded-full bg-crimson-gradient text-primary-foreground"
                          aria-label="Open"
                        >
                          <Play className="h-3.5 w-3.5 fill-current" />
                        </Link>
                      )}
                      <button
                        onClick={() => {
                          removeDesk(d.id);
                        }}
                        className="grid h-8 w-8 place-items-center rounded-full bg-destructive/10 text-destructive"
                        aria-label="Remove"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>



                    <div className="mt-3 rounded-xl border border-purple-500/30 bg-purple-500/5 p-3">
                      {!item && !isPicking && (
                        <button
                          onClick={() => setPickerFor(d.id)}
                          className="flex w-full items-center justify-between gap-3 text-left"
                        >
                          <span className="flex items-center gap-2">
                            <span className="grid h-8 w-8 place-items-center rounded-lg bg-purple-500/15 text-purple-300">
                              <Brain className="h-4 w-4" />
                            </span>
                            <span className="block text-[12px] font-bold uppercase tracking-wide text-purple-200">
                              Activate Automated Active Recall Tracking
                            </span>
                          </span>
                          <span className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full bg-muted">
                            <span className="ml-0.5 h-5 w-5 rounded-full bg-background shadow" />
                          </span>
                        </button>
                      )}
                      {!item && isPicking && (
                        <div className="grid grid-cols-2 gap-2">
                          <button onClick={() => activate(d.id, d.name, "hard")} className="flex flex-col items-start gap-0.5 rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 text-left">
                            <span className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-destructive">
                              <Flame className="h-3.5 w-3.5" /> Hard / Shaky
                            </span>
                            <span className="text-[10px] text-muted-foreground">Recall in 12h</span>
                          </button>
                          <button onClick={() => activate(d.id, d.name, "easy")} className="flex flex-col items-start gap-0.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-2.5 text-left">
                            <span className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-emerald-400">
                              <Zap className="h-3.5 w-3.5" /> Easy / Strong
                            </span>
                            <span className="text-[10px] text-muted-foreground">Recall in 24h</span>
                          </button>
                        </div>
                      )}
                      {item && (
                        <div>
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-bold uppercase tracking-wide text-purple-200">
                              {item.fractured ? "FRACTURED" : `Level ${item.displayTier ?? 0}/5`}
                            </span>
                            <span className="text-muted-foreground">
                              {item.fractured ? "Restore required" : new Date(item.nextDueAt).toLocaleString()}
                            </span>
                          </div>
                          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className={item.fractured ? "h-full bg-destructive/70" : "h-full bg-gradient-to-r from-purple-400 to-fuchsia-500"}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          {item.fractured ? (
                            <Link to="/recall/$itemId" params={{ itemId: item.id }} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-destructive px-3 py-2 text-[11px] font-black uppercase tracking-widest text-destructive-foreground">
                              Enter Restoration Recall
                            </Link>
                          ) : pct >= 100 ? (
                            <Link to="/recall/$itemId" params={{ itemId: item.id }} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-purple-500 to-fuchsia-500 px-3 py-2 text-[11px] font-black uppercase tracking-widest text-white">
                              <Brain className="h-3.5 w-3.5" /> Recall Now · Overdue
                            </Link>
                          ) : item.mastered ? (
                            <button onClick={() => relooп(item)} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-purple-500 to-fuchsia-500 px-3 py-2 text-[11px] font-black uppercase tracking-widest text-white">
                              <RotateCcw className="h-3.5 w-3.5" /> Initiate Re-Recall Cycle
                            </button>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

    </div>
  );
}
