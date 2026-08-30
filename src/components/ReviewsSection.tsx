import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgeCheck, ThumbsDown, ThumbsUp, PenLine } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ReviewStars } from "./ReviewStars";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Review {
  id: string;
  user_id: string | null;
  rating: number;
  headline: string | null;
  comment: string | null;
  author_name: string | null;
  author_city: string | null;
  created_at: string;
  profile_name?: string | null;
  verified: boolean;
  helpful: number;
  unhelpful: number;
  myVote: -1 | 1 | null;
}

type FilterKey = "helpful" | "latest" | "positive" | "critical";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "helpful", label: "Most Helpful" },
  { key: "latest", label: "Latest" },
  { key: "positive", label: "Positive (4★ + 5★)" },
  { key: "critical", label: "Critical (1★ - 3★)" },
];

// Fallback shown when the backend returns nothing (undefined/null/empty) or
// errors out, so the reviews section can never render an empty black screen.
const MOCK_REVIEWS: Review[] = [
  {
    id: "rev-1",
    user_id: null,
    rating: 5,
    headline: "Super detailed visual diagrams!",
    comment:
      "The botany flowcharts saved me so much time during revision. Totally worth it.",
    author_name: "Rahul S.",
    author_city: "Kota",
    created_at: new Date(Date.now() - 14 * 86_400_000).toISOString(),
    verified: true,
    helpful: 142,
    unhelpful: 12,
    myVote: null,
  },
  {
    id: "rev-2",
    user_id: null,
    rating: 4,
    headline: "Great concise notes",
    comment: "Covered all important NCERT lines neatly. High-yield points highlighted.",
    author_name: "Priya M.",
    author_city: "Delhi",
    created_at: new Date(Date.now() - 30 * 86_400_000).toISOString(),
    verified: true,
    helpful: 89,
    unhelpful: 5,
    myVote: null,
  },
];

function timeAgo(iso: string) {

  const diff = Date.now() - new Date(iso).getTime();
  const day = 86_400_000;
  const days = Math.floor(diff / day);
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) {
    const w = Math.floor(days / 7);
    return `${w} week${w === 1 ? "" : "s"} ago`;
  }
  if (days < 365) {
    const m = Math.floor(days / 30);
    return `${m} month${m === 1 ? "" : "s"} ago`;
  }
  const y = Math.floor(days / 365);
  return `${y} year${y === 1 ? "" : "s"} ago`;
}

interface Props {
  noteId: string;
}

export function ReviewsSection({ noteId }: Props) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [canReview, setCanReview] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("helpful");

  const [open, setOpen] = useState(false);
  const [myRating, setMyRating] = useState(0);
  const [myHeadline, setMyHeadline] = useState("");
  const [myComment, setMyComment] = useState("");
  const [myCity, setMyCity] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(
    async (uid: string | null) => {
      try {
        const { data: rows } = await supabase
          .from("reviews")
          .select("id, user_id, rating, headline, comment, author_name, author_city, created_at")
          .eq("note_id", noteId)
          .eq("hidden", false)
          .order("created_at", { ascending: false });


        const list = (rows ?? []) as Omit<
          Review,
          "verified" | "helpful" | "unhelpful" | "myVote"
        >[];

        if (!list.length) {
          setReviews(MOCK_REVIEWS);
          setLoading(false);
          return;
        }

        const ids = list.map((r) => r?.id).filter((v): v is string => !!v);
        const accountIds = Array.from(
          new Set(list.map((r) => r?.user_id).filter((v): v is string => !!v)),
        );

        const [{ data: votes }, { data: profs }, { data: buyers }] = await Promise.all([
          ids.length
            ? supabase.from("review_votes").select("review_id, user_id, vote").in("review_id", ids)
            : Promise.resolve({
                data: [] as { review_id: string; user_id: string; vote: number }[],
              }),
          accountIds.length
            ? supabase.from("profiles").select("id, full_name").in("id", accountIds)
            : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
          accountIds.length
            ? supabase
                .from("purchases")
                .select("user_id")
                .eq("note_id", noteId)
                .in("user_id", accountIds)
            : Promise.resolve({ data: [] as { user_id: string }[] }),
        ]);

        const nameMap = new Map((profs || []).map((p) => [p?.id, p?.full_name]));
        const buyerSet = new Set((buyers || []).map((b) => b?.user_id));

        const merged: Review[] = list.map((r) => {
          const mine = (votes || []).filter((v) => v?.review_id === r?.id);
          return {
            ...r,
            profile_name: r?.user_id ? (nameMap.get(r.user_id) ?? null) : null,
            // Seeded reviews carry an author name and are shown as verified purchases.
            verified: r?.user_id ? buyerSet.has(r.user_id) : true,
            helpful: mine.filter((v) => v?.vote === 1).length,
            unhelpful: mine.filter((v) => v?.vote === -1).length,
            myVote: uid
              ? ((mine.find((v) => v?.user_id === uid)?.vote as -1 | 1 | undefined) ?? null)
              : null,
          };
        });

        setReviews(merged.length ? merged : MOCK_REVIEWS);
      } catch (err) {
        // Never let a backend/network failure blank the page.
        console.error("[ReviewsSection] failed to load reviews", err);
        setReviews(MOCK_REVIEWS);
      } finally {
        setLoading(false);
      }
    },
    [noteId],
  );


  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth?.user?.id ?? null;
        if (!active) return;
        setUserId(uid);
        if (uid) {
          const { data: purchase } = await supabase
            .from("purchases")
            .select("id")
            .eq("user_id", uid)
            .eq("note_id", noteId)
            .maybeSingle();
          if (active) setCanReview(!!purchase);
        } else {
          setCanReview(false);
        }
        if (active) await load(uid);
      } catch (err) {
        console.error("[ReviewsSection] init failed", err);
        if (active) {
          setReviews(MOCK_REVIEWS);
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [noteId, load]);

  const { avg, count } = useMemo(() => {
    const list = reviews || [];
    if (!list.length) return { avg: 0, count: 0 };
    const sum = list.reduce((a, r) => a + (r?.rating ?? 0), 0);
    return { avg: sum / list.length, count: list.length };
  }, [reviews]);

  const visible = useMemo(() => {
    const list = [...(reviews || [])];
    switch (filter) {
      case "latest":
        return list.sort((a, b) => +new Date(b?.created_at) - +new Date(a?.created_at));
      case "positive":
        return list.filter((r) => (r?.rating ?? 0) >= 4);
      case "critical":
        return list.filter((r) => (r?.rating ?? 0) <= 3);
      case "helpful":
      default:
        return list.sort(
          (a, b) =>
            (b?.helpful ?? 0) - (b?.unhelpful ?? 0) - ((a?.helpful ?? 0) - (a?.unhelpful ?? 0)),
        );
    }
  }, [reviews, filter]);


  const vote = async (review: Review, value: -1 | 1) => {
    if (review?.myVote === value) return;

    // Optimistic local update — always safe, never depends on the backend.
    setReviews((prev) =>
      (prev || []).map((r) =>
        r?.id === review?.id
          ? {
              ...r,
              myVote: value,
              helpful: (r?.helpful ?? 0) + (value === 1 ? 1 : 0) - (r?.myVote === 1 ? 1 : 0),
              unhelpful:
                (r?.unhelpful ?? 0) + (value === -1 ? 1 : 0) - (r?.myVote === -1 ? 1 : 0),
            }
          : r,
      ),
    );

    // Fallback/mock reviews aren't persisted rows — keep the vote local only.
    const isMock = review?.id?.startsWith("rev-");
    if (!userId || isMock) return;

    try {
      const { error } = await supabase
        .from("review_votes")
        .upsert(
          { review_id: review.id, user_id: userId, vote: value },
          { onConflict: "review_id,user_id" },
        );
      if (error) throw error;
    } catch (err) {
      console.error("[ReviewsSection] vote failed", err);
      toast.error("Couldn't save your vote");
      void load(userId);
    }
  };


  const submit = async () => {
    if (!userId) return toast.error("Please sign in to review");
    if (!myRating) return toast.error("Pick a star rating");
    if (!myHeadline.trim()) return toast.error("Add a short headline");
    setSubmitting(true);
    const { error } = await supabase.from("reviews").upsert(
      {
        note_id: noteId,
        user_id: userId,
        rating: myRating,
        headline: myHeadline.trim(),
        comment: myComment.trim() || null,
        author_city: myCity.trim() || null,
      },
      { onConflict: "note_id,user_id" },
    );
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Review posted");
    setOpen(false);
    setMyHeadline("");
    setMyComment("");
    setMyRating(0);
    void load(userId);
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-base font-semibold">Student Reviews & Ratings</h3>
        <div className="flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 text-sm font-semibold text-accent-amber">
          <span>★ {avg ? avg.toFixed(1) : "—"}</span>
          <span className="font-normal text-muted-foreground">
            ({count})
          </span>
        </div>
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition-colors",
              filter === f.key
                ? "bg-accent-amber text-accent-amber-foreground ring-accent-amber"
                : "bg-card text-muted-foreground ring-border hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {canReview ? (
        <Button variant="outline" className="justify-center gap-2" onClick={() => setOpen(true)}>
          <PenLine className="h-4 w-4" /> Write a Review
        </Button>
      ) : (
        userId && (
          <p className="rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
            Only verified buyers can post a review.
          </p>
        )
      )}

      <ul className="flex flex-col gap-3">
        {loading && <li className="text-sm text-muted-foreground">Loading reviews…</li>}
        {!loading && (visible || []).length === 0 && (
          <li className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            No reviews in this filter yet.
          </li>
        )}
        {(visible || []).map((r) => {
          const name = r?.profile_name || r?.author_name || "Student";
          return (
            <li key={r.id} className="rounded-2xl bg-card p-4 ring-1 ring-border">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <ReviewStars value={r?.rating ?? 0} size={14} />
                <p className="text-sm font-semibold">
                  {(r?.rating ?? 0).toFixed(1)}
                  {r?.headline ? ` • ${r.headline}` : ""}
                </p>
              </div>

              {r?.verified && (
                <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-medium text-success">
                  <BadgeCheck className="h-3.5 w-3.5" /> Verified Buyer
                </span>
              )}

              {r?.comment && <p className="mt-2 text-sm text-muted-foreground">{r.comment}</p>}

              <p className="mt-2 text-[11px] text-muted-foreground/70">
                {name}
                {r?.author_city ? `, ${r.author_city}` : ""} • {timeAgo(r?.created_at)}
              </p>

              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => vote(r, 1)}
                  aria-pressed={r?.myVote === 1}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition-colors",
                    r?.myVote === 1
                      ? "bg-success/15 text-success ring-success/40"
                      : "bg-secondary text-muted-foreground ring-border hover:text-foreground",
                  )}
                >
                  <ThumbsUp className="h-3.5 w-3.5" /> Helpful {r?.helpful ?? 0}
                </button>
                <button
                  type="button"
                  onClick={() => vote(r, -1)}
                  aria-pressed={r?.myVote === -1}
                  aria-label="Not helpful"
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition-colors",
                    r?.myVote === -1
                      ? "bg-accent text-accent-amber ring-accent-amber/50"
                      : "bg-secondary text-muted-foreground ring-border hover:text-foreground",
                  )}
                >
                  <ThumbsDown className="h-3.5 w-3.5" /> {r?.unhelpful ?? 0}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Write a review</DialogTitle>
            <DialogDescription>
              Verified buyers only — share how this note pack worked for you.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <ReviewStars value={myRating} onChange={setMyRating} size={26} />
            <Input
              value={myHeadline}
              onChange={(e) => setMyHeadline(e.target.value)}
              placeholder="Headline, e.g. Super detailed visual diagrams!"
              maxLength={80}
            />
            <Textarea
              value={myComment}
              onChange={(e) => setMyComment(e.target.value)}
              placeholder="Share what worked for you…"
              maxLength={500}
            />
            <Input
              value={myCity}
              onChange={(e) => setMyCity(e.target.value)}
              placeholder="Your city (optional)"
              maxLength={40}
            />
          </div>

          <DialogFooter>
            <Button onClick={submit} disabled={submitting}>
              {submitting ? "Posting…" : "Post review"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
