import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState, lazy, Suspense } from "react";
import { ArrowLeft, BookOpen, Check, Loader2, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReviewsSection } from "@/components/ReviewsSection";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { SamplePagesGallery } from "@/components/SamplePagesGallery";
// Sample-page previewer pulls in image-heavy UI — load on demand.
const SamplePagesModal = lazy(() => import("@/components/SamplePagesModal").then((m) => ({ default: m.SamplePagesModal })));
import { useLanguagePreference } from "@/lib/language-preference";
import {
  conceptList,
  listNotes,
  noteLanguages,
  pageCountForLanguage,
  pdfPathForLanguage,
  type Note,
} from "@/lib/notes-store";
import { IS_TESTING_MODE } from "@/lib/testing-mode";
import { listPurchasedNoteIds } from "@/lib/notes-store";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/notes/$noteId")({
  head: () => ({
    meta: [
      { title: "Note Pack — From The Last Bench" },
      {
        name: "description",
        content: "Preview sample pages, pick your language and unlock lifetime access.",
      },
      { property: "og:title", content: "Note Pack — From The Last Bench" },
      {
        property: "og:description",
        content: "Ultra-dense visual notes with Recall Station active-retrieval sheets.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NoteDetailPage,
});

function NoteDetailPage() {
  const { noteId } = useParams({ from: "/_app/notes/$noteId" });
  const navigate = useNavigate();
  const [language, setLanguage] = useLanguagePreference();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const { user, requireAuth } = useAuth();
  const { isAdmin } = useIsAdmin();
  const [owned, setOwned] = useState(false);
  const [buying, setBuying] = useState(false);

  useEffect(() => {
    let active = true;
    if (!user) {
      setOwned(false);
      return;
    }
    void listPurchasedNoteIds()
      .then((ids) => {
        if (active) setOwned(ids.includes(noteId));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user, noteId, buying]);

  /** Records the unlock in `purchases` so the pack shows up in My Library. */
  const recordUnlock = async () => {
    if (!user) return;
    const { error } = await supabase
      .from("purchases")
      .upsert({ user_id: user.id, note_id: noteId }, { onConflict: "user_id,note_id" });
    if (error) throw new Error(error.message);
  };

  /** Simulated checkout: records the purchase, then opens the reader. */
  const buyNow = async () => {
    if (!requireAuth("generic")) return;
    setBuying(true);
    try {
      await recordUnlock();
      if (price > 0) toast.success("Payment confirmed — pack unlocked!");
      setOwned(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Purchase failed");
    } finally {
      setBuying(false);
    }
  };

  /** Free / admin / owned "Read Now": ensure a library record, then open. */
  const readNow = async () => {
    if (!requireAuth("generic")) return;
    try {
      await recordUnlock();
    } catch {
      /* reading still works even if the library record fails */
    }
    void navigate({ to: "/reader/$noteId", params: { noteId }, search: { mode: "standard" } });
  };

  useEffect(() => {
    let active = true;
    void listNotes()
      .then((rows) => {
        if (active) setNotes(rows);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const note = useMemo(() => notes.find((n) => n.id === noteId) ?? null, [notes, noteId]);

  const pageCount = note ? pageCountForLanguage(note, language, notes) : null;
  const concepts = note ? conceptList(note) : [];
  const availableLanguages = note ? noteLanguages(note, notes) : ["hinglish", "english"];
  const hasVariant = note ? Boolean(pdfPathForLanguage(note, language, notes)) : true;
  const price = note ? (note.is_free ? 0 : note.price_inr) : 29;

  return (
    <div className="flex flex-col gap-6 px-5 pt-4">
      <header className="flex items-center gap-3">
        <Link
          to="/home"
          aria-label="Back"
          className="grid h-10 w-10 place-items-center rounded-full bg-card ring-1 ring-border"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <p className="text-sm font-medium text-muted-foreground">Note pack</p>
      </header>

      <div className="relative overflow-hidden rounded-3xl bg-crimson-gradient p-5 text-primary-foreground shadow-lg">
        <Sparkles className="absolute right-4 top-4 h-6 w-6 text-accent-amber" />
        <p className="text-xs font-semibold uppercase tracking-wider text-primary-foreground/80">
          {note?.subject || (loading ? "Loading…" : "Note pack")}
        </p>
        <h1 className="mt-1 text-2xl text-primary-foreground">
          {note?.title ?? (loading ? "Loading…" : "Note pack")}
        </h1>
        <p className="mt-2 text-sm text-primary-foreground/85">
          {note?.description ?? ""}
        </p>
        <div className="mt-3 inline-flex items-center rounded-full bg-primary-foreground/15 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-primary-foreground">
          Precision Typed
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-full bg-accent-amber px-3 py-1.5 text-sm font-bold text-accent-amber-foreground w-fit">
          {price === 0 ? "Free · Lifetime" : `₹${price} · Lifetime`}
        </div>
      </div>

      {loading && (
        <div className="flex justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}

      <section>
        <h2 className="text-base font-semibold">What's Inside</h2>
        <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
          <li>
            • {pageCount ?? note?.page_count ?? "—"} Pages of Ultra-Dense Visual Notes &amp;
            Flowcharts
          </li>
          <li>
            • Integrated "Recall Station" Active-Retrieval Sheets (Outperforms Static PYQs)
          </li>
          <li>• High-Yield Mind Maps &amp; Zero-Fluff Concept Trees</li>
        </ul>
      </section>

      <section className="rounded-3xl border border-accent-amber/40 bg-accent-amber/10 p-4">
        <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-accent-amber">
          <Zap className="h-4 w-4" aria-hidden /> What is the Recall Station?
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Standard PYQs only test past questions. The Recall Station features specialized Active
          Recall Pages where key terms, examples, and crucial exam facts are replaced with blank
          testing boxes. As you review, your brain is forced to actively recall the missing
          keywords—building instant muscle memory so you can solve any new or twisted question on
          exam day.
        </p>
      </section>

      {concepts.length > 0 && (
        <section>
          <h2 className="text-base font-semibold">Concepts Covered in This Chapter</h2>
          <ul className="mt-2 space-y-1.5">
            {concepts.map((c) => (
              <li key={c} className="flex items-start gap-2 text-sm text-muted-foreground">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent-amber" aria-hidden />
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {note && <SamplePagesGallery paths={note.preview_images ?? []} />}

      <div className="flex flex-col gap-3 rounded-3xl bg-card p-4 ring-1 ring-border">
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
          Choose your language
        </p>
        <LanguageSwitcher value={language} onChange={setLanguage} showDisclaimer />
        {!hasVariant && (
          <p className="text-[11px] font-semibold text-destructive">
            The {language === "english" ? "English" : "Hinglish"} variant isn't uploaded for this
            chapter yet.
          </p>
        )}
        {availableLanguages.length > 0 && (
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Attached PDF: {language === "english" ? "English" : "Hinglish"} edition
          </p>
        )}
      </div>

      <div className="sticky top-2 z-10 flex gap-2">
        {IS_TESTING_MODE || owned || isAdmin ? (
          <Button
            onClick={readNow}
            className="flex-1 bg-crimson-gradient text-primary-foreground shadow-md"
          >
            Read Now{isAdmin && !owned ? " · Admin" : ""}
          </Button>
        ) : (
          <Button
            onClick={buyNow}
            disabled={buying}
            className="flex-1 bg-crimson-gradient text-primary-foreground shadow-md"
          >
            {buying ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Processing…
              </>
            ) : (
              <>Buy Now · {price === 0 ? "Free" : `₹${price}`}</>
            )}
          </Button>
        )}
        <Button
          variant="secondary"
          size="icon"
          aria-label="Preview sample pages"
          title="Preview Sample Pages"
          onClick={() => setPreviewOpen(true)}
        >
          <BookOpen className="h-4 w-4" />
        </Button>
      </div>

      {previewOpen && (
        <Suspense fallback={null}>
          <SamplePagesModal
            open={previewOpen}
            onClose={() => setPreviewOpen(false)}
            paths={note?.preview_images ?? []}
          />
        </Suspense>
      )}

      <ReviewsSection noteId={noteId} />
    </div>
  );
}
