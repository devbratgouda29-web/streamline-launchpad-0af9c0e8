import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, Search, Skull } from "lucide-react";
import { Component, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

import { getAllItems, getFracturedItems, restoreItem, subscribe as subscribeRevision, type RevisionItem } from "@/lib/revision-engine";
import { TierBadge, type TierNumber } from "@/components/TierBadge";
import { NotificationBell } from "@/components/NotificationBell";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { listNotes, type Note } from "@/lib/notes-store";


export const Route = createFileRoute("/_app/home")({
  head: () => ({
    meta: [
      { title: "Home — From The Last Bench" },
      { name: "description", content: "Browse study notes by subject and grab the ones you need." },
    ],
  }),
  component: () => (
    <ErrorBoundary>
      <HomePage />
    </ErrorBoundary>
  ),

});

const FALLBACK_NAME = "Achiever";

class GreetingBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: unknown) {
    console.error("GreetingBoundary caught:", err);
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

function Greeting() {
  const name = useDisplayName();
  const safeName =
    typeof name === "string" && name.trim() !== "" ? name.trim() : FALLBACK_NAME;
  return (
    <div className="min-w-0">
      <h1 className="text-xl sm:text-2xl font-bold text-foreground break-words leading-tight">
        Welcome back, {safeName.toUpperCase()}
      </h1>
    </div>
  );
}

const FallbackGreeting = (
  <div className="min-w-0">
    <h1 className="text-xl sm:text-2xl font-bold text-foreground break-words leading-tight">
      Welcome back, {FALLBACK_NAME.toUpperCase()}
    </h1>
  </div>
);

type ChapterNote = {
  id: string;
  title: string;
  tag: string;
  price: number;
  isFree: boolean;
};

/** Reduces a "Physics · 12" style label down to just the subject name. */
function subjectGroup(subject: string): string {
  return (subject.split("·")[0] ?? subject).trim() || "General";
}



function useDisplayName(): string | null {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const derive = (user: { user_metadata?: Record<string, unknown>; email?: string | null } | null) => {
      try {
        if (!user) return null;
        const meta = user.user_metadata ?? {};
        const raw =
          (meta.full_name as string | undefined) ||
          (meta.name as string | undefined) ||
          (meta.display_name as string | undefined) ||
          (meta.preferred_username as string | undefined) ||
          (user.email ? user.email.split("@")[0] : null);
        if (!raw || typeof raw !== "string") return null;
        const trimmed = raw.trim();
        if (!trimmed) return null;
        const first = trimmed.split(/[\s._-]+/)[0] ?? trimmed;
        return first || null;
      } catch {
        return null;
      }
    };
    type AuthUser = { user_metadata?: Record<string, unknown>; email?: string | null } | null;
    supabase.auth.getUser().then(({ data }: { data: { user: AuthUser } }) => {
      if (!active) return;
      setName(derive(data.user));
    }).catch(() => {});
    const { data: sub } = supabase.auth.onAuthStateChange((_e: unknown, session: { user?: AuthUser } | null) => {
      setName(derive(session?.user ?? null));
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  return name;
}

function HomePage() {
  const [fractured, setFractured] = useState<RevisionItem[]>([]);
  const [tracked, setTracked] = useState<RevisionItem[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState<string>("All");
  // Hydration guard: this screen reads client-only stores, so the first
  // client render must match the server HTML before they are consulted.
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);

  useEffect(() => {
    const sync = () => {
      setFractured(getFracturedItems());
      setTracked(getAllItems());
    };
    sync();
    const u = subscribeRevision(sync);
    return () => { u(); };
  }, []);


  


  // Catalogue comes straight from the database so every card carries its real id.
  useEffect(() => {
    let active = true;
    void listNotes()
      .then((rows) => {
        if (active) setNotes(rows);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const cards: ChapterNote[] = notes.map((n) => ({
    id: n.id,
    title: n.title,
    tag: n.subject || "Notes",
    price: n.is_free ? 0 : n.price_inr,
    isFree: n.is_free,
  }));

  const subjectFilters = ["All", "Botany", "Zoology"];

  const subjectNotes =
    subject === "All"
      ? cards
      : cards.filter((c) =>
          (c.tag + " " + subjectGroup(c.tag)).toLowerCase().includes(subject.toLowerCase()),
        );

  const filteredNotes = query.trim()
    ? subjectNotes.filter((n) =>
        (n.title + " " + n.tag).toLowerCase().includes(query.trim().toLowerCase()),
      )
    : subjectNotes;

  return (
    <div className="flex flex-col gap-6 px-5 pt-6">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <GreetingBoundary fallback={FallbackGreeting}>
          <Greeting />
        </GreetingBoundary>

        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => setSearchOpen((v) => !v)}
            aria-label="Search"
            className="grid h-10 w-10 place-items-center rounded-full bg-card text-foreground ring-1 ring-border"
          >
            <Search className="h-5 w-5" />
          </button>
          {isMounted ? (
            <NotificationBell />
          ) : (
            <span
              aria-hidden
              className="grid h-10 w-10 place-items-center rounded-full bg-card text-foreground ring-1 ring-border"
            >
              <Bell className="h-5 w-5" />
            </span>
          )}
        </div>
      </header>






      {searchOpen && (
        <div className="rounded-2xl border border-border bg-card p-3 ring-1 ring-accent-amber/30">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search chapters, notes, PDFs…"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground"
              >
                Clear
              </button>
            )}
          </div>
          {query.trim() && (
            <div className="mt-3 border-t border-border pt-3">
              {filteredNotes.length === 0 ? (
                <p className="text-xs text-muted-foreground">No matches.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {filteredNotes.map((n) => (
                    <li key={n.id}>
                      <Link
                        to="/notes/$noteId"
                        params={{ noteId: n.id }}
                        className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-background"
                        onClick={() => setSearchOpen(false)}
                      >
                        <span className="text-sm">{n.title}</span>
                        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{n.tag}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {fractured.length > 0 && (
        <section className="relative overflow-hidden rounded-3xl border-2 border-destructive/70 bg-destructive/10 p-4 shadow-[0_0_60px_-10px_oklch(0.55_0.28_25_/_0.9)]">
          <div className="pointer-events-none absolute inset-0 animate-pulse" style={{
            background: "radial-gradient(circle at 30% 20%, oklch(0.55 0.28 25 / 0.35), transparent 60%)",
          }} />
          <div className="relative">
            <div className="flex items-center gap-2">
              <Skull className="h-5 w-5 text-destructive" />
              <h2 className="text-sm font-black uppercase tracking-[0.2em] text-destructive">Debt Recall — Lockdown Active</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Fractured shields freeze your progress. Complete a Restoration Recall to lift the lockdown.
            </p>
            <ul className="mt-3 flex flex-col gap-2">
              {fractured.map((f) => (
                <li key={f.id}>
                  <Link
                    to="/recall/$itemId"
                    params={{ itemId: f.id }}
                    className="flex items-center gap-3 rounded-2xl bg-background/70 p-3 ring-1 ring-destructive/40"
                  >
                    <TierBadge tier={f.tier as TierNumber} size={64} fractured />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{f.name}</p>
                      <p className="text-[11px] text-destructive">Restore now →</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => {
                fractured.forEach((f) => restoreItem(f.id, "easy"));
              }}
              className="mt-3 w-full rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300/90 hover:bg-amber-400/20"
            >
              [ Dev Pass: Bypass Lockdown ]
            </button>
          </div>
        </section>
      )}


      


      <section className="flex justify-center">
        <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-card">
          <img
            src="/home-banner.jpg"
            alt="From The Last Bench emblem — Average Skilled, Phenomenally Willed"
            className="block aspect-video w-full select-none object-contain"
            draggable={false}
          />
        </div>
      </section>


      <div className="-mx-5 overflow-x-auto px-5">
        <div className="flex w-max gap-2">
          {subjectFilters.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={subject === c}
              onClick={() => setSubject(c)}
              className={
                subject === c
                  ? "rounded-full bg-accent-amber px-4 py-1.5 text-xs font-semibold text-accent-amber-foreground"
                  : "rounded-full bg-card px-4 py-1.5 text-xs font-medium text-foreground ring-1 ring-border"
              }
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">Latest Notes</h3>
          <button
            type="button"
            onClick={() => setSubject("All")}
            className="text-sm font-medium text-accent-amber"
          >
            See all
          </button>
        </div>
        {filteredNotes.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card p-6 text-center text-xs text-muted-foreground">
            No {subject} notes yet.
          </p>
        ) : (
        <div className="grid grid-cols-2 gap-3">
          {filteredNotes.map((n) => (

            <Link
              key={n.id}
              to="/notes/$noteId"
              params={{ noteId: n.id }}
              className="group rounded-2xl bg-card p-3 ring-1 ring-border transition-transform active:scale-[0.98]"
            >
              <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-crimson-gradient">
                <div className="absolute inset-0 flex items-end p-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-primary-foreground/80">
                    {n.tag}
                  </span>
                </div>
                <span className="absolute right-2 top-2 rounded-full bg-accent-amber px-2 py-0.5 text-[11px] font-bold text-accent-amber-foreground">
                  {n.isFree ? "Free" : `₹${n.price}`}
                </span>
                <span className="absolute left-2 top-2 rounded-full bg-background/85 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-foreground ring-1 ring-border">
                  Visual Layout
                </span>
              </div>
              <p className="mt-2 truncate text-sm font-semibold">{n.title}</p>
              <p className="truncate text-[11px] text-muted-foreground">{n.tag}</p>
            </Link>
          ))}
        </div>
        )}
      </section>

    </div>
  );
}
