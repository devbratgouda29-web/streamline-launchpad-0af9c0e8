import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { BarChart3, Eye, EyeOff, FlaskConical, Loader2, ShieldCheck, Star, Users } from "lucide-react";
import { toast } from "sonner";
import {
  getPurchaseAnalytics,
  listReviewsForModeration,
  listUsers,
  setReviewHidden,
  setUserAdmin,
  type AdminReview,
  type AdminUser,
  type PurchaseAnalytics,
} from "@/lib/admin.functions";
import { bypassAllTimers, getAllItems, getFracturedItems, restoreItem, setDisplayTier, type RevisionItem } from "@/lib/revision-engine";
import { addStudySession, type StudySubject } from "@/lib/study-sessions";
import { IS_TESTING_MODE } from "@/lib/testing-mode";
import { cn } from "@/lib/utils";

const card = "flex flex-col gap-3 rounded-2xl bg-card p-4 ring-1 ring-border";
const heading =
  "flex items-center gap-2 text-sm font-black uppercase tracking-widest text-muted-foreground";

function inr(n: number) {
  return `₹${n.toLocaleString("en-IN")}`;
}

/** 3. Purchase analytics summary. */
export function PurchaseAnalyticsCard() {
  const fetchAnalytics = useServerFn(getPurchaseAnalytics);
  const [data, setData] = useState<PurchaseAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await fetchAnalytics();
        if (active) setData(res);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Failed to load analytics");
      }
    })();
    return () => {
      active = false;
    };
  }, [fetchAnalytics]);

  return (
    <section className={card}>
      <h2 className={heading}>
        <BarChart3 className="h-4 w-4" /> Purchase analytics
      </h2>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {!data && !error ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : data ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: "Revenue", value: inr(data.totalRevenue) },
              { label: "Purchases", value: String(data.totalPurchases) },
              { label: "Buyers", value: String(data.buyers) },
              { label: "Last 7 days", value: String(data.last7Days) },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-muted/40 p-3">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  {s.label}
                </p>
                <p className="mt-1 text-lg font-black">{s.value}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            {data.topNotes.length === 0 ? (
              <p className="text-xs text-muted-foreground">No purchases yet.</p>
            ) : (
              data.topNotes.map((n) => (
                <div
                  key={n.note_id}
                  className="flex items-center justify-between gap-3 rounded-lg bg-muted/30 px-3 py-2 text-xs"
                >
                  <span className="truncate font-semibold">{n.title}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {n.count} sold · {inr(n.revenue)}
                  </span>
                </div>
              ))
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Last 30 days: {data.last30Days} purchases.
          </p>
        </>
      ) : null}
    </section>
  );
}

/** 2a. User management. */
export function UserManagementCard() {
  const fetchUsers = useServerFn(listUsers);
  const toggleAdmin = useServerFn(setUserAdmin);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setUsers(await fetchUsers());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users");
    }
  }, [fetchUsers]);

  useEffect(() => {
    void load();
  }, [load]);

  const flip = async (u: AdminUser) => {
    setBusy(u.id);
    try {
      const res = await toggleAdmin({ data: { userId: u.id, admin: !u.is_admin } });
      if (!res.ok) {
        toast.error(res.error ?? "Update failed");
        return;
      }
      toast.success(u.is_admin ? "Admin access removed" : "Admin access granted");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(null);
    }
  };


  return (
    <section className={card}>
      <h2 className={heading}>
        <Users className="h-4 w-4" /> User management ({users?.length ?? 0})
      </h2>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {!users ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        <div className="flex max-h-96 flex-col gap-1.5 overflow-auto">
          {users.map((u) => (
            <div
              key={u.id}
              className="flex items-center justify-between gap-3 rounded-lg bg-muted/30 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold">
                  {u.full_name || u.email || "Student"}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {u.email} · {u.purchases} purchase{u.purchases === 1 ? "" : "s"}
                </p>
              </div>
              <button
                type="button"
                disabled={busy === u.id}
                onClick={() => void flip(u)}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide ring-1 transition-colors",
                  u.is_admin
                    ? "bg-accent-amber text-accent-amber-foreground ring-accent-amber"
                    : "bg-background text-muted-foreground ring-border hover:text-foreground",
                )}
              >
                {busy === u.id ? "…" : u.is_admin ? "Admin" : "Make admin"}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** 2b. Review moderation toggle. */
export function ReviewModerationCard() {
  const fetchReviews = useServerFn(listReviewsForModeration);
  const toggleHidden = useServerFn(setReviewHidden);
  const [reviews, setReviews] = useState<AdminReview[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setReviews(await fetchReviews());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load reviews");
    }
  }, [fetchReviews]);

  useEffect(() => {
    void load();
  }, [load]);

  const flip = async (r: AdminReview) => {
    setBusy(r.id);
    try {
      await toggleHidden({ data: { reviewId: r.id, hidden: !r.hidden } });
      setReviews((prev) =>
        (prev ?? []).map((x) => (x.id === r.id ? { ...x, hidden: !x.hidden } : x)),
      );
      toast.success(r.hidden ? "Review published" : "Review hidden");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className={card}>
      <h2 className={heading}>
        <ShieldCheck className="h-4 w-4" /> Review moderation ({reviews?.length ?? 0})
      </h2>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {!reviews ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : reviews.length === 0 ? (
        <p className="text-xs text-muted-foreground">No reviews yet.</p>
      ) : (
        <div className="flex max-h-96 flex-col gap-2 overflow-auto">
          {reviews.map((r) => (
            <div
              key={r.id}
              className={cn(
                "flex items-start justify-between gap-3 rounded-lg px-3 py-2",
                r.hidden ? "bg-destructive/10" : "bg-muted/30",
              )}
            >
              <div className="min-w-0">
                <p className="flex items-center gap-1 text-xs font-semibold">
                  <Star className="h-3 w-3 fill-accent-amber text-accent-amber" />
                  {r.rating} · {r.headline || "No headline"}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {r.author || "Anonymous"} on {r.note_title || "chapter"}
                </p>
                {r.comment && (
                  <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                    {r.comment}
                  </p>
                )}
              </div>
              <button
                type="button"
                disabled={busy === r.id}
                onClick={() => void flip(r)}
                className="flex shrink-0 items-center gap-1 rounded-full bg-background px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide ring-1 ring-border hover:text-foreground"
              >
                {r.hidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {r.hidden ? "Hidden" : "Visible"}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** 4. Demo / testing tools — tier badges, focus hours and library shortcuts. */
export function TestingToolsCard() {
  const [items, setItems] = useState<RevisionItem[]>([]);
  const [hours, setHours] = useState("2");
  const [subject, setSubject] = useState<StudySubject>("Physics");

  const refresh = useCallback(() => setItems(getAllItems()), []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const grant = (id: string, tier: 1 | 2 | 3 | 4 | 5 | null) => {
    setDisplayTier(id, tier);
    refresh();
    toast.success(tier ? `Tier ${tier} badge granted` : "Badge revoked");
  };

  const addHours = () => {
    const h = Number(hours);
    if (!Number.isFinite(h) || h <= 0) return toast.error("Enter a valid number of hours");
    addStudySession({
      userId: "demo",
      subject,
      topic: "Admin demo session",
      durationMinutes: Math.round(h * 60),
      timestamp: Date.now(),
    });
    toast.success(`${h}h of ${subject} focus added`);
  };

  return (
    <section className={card}>
      <h2 className={heading}>
        <FlaskConical className="h-4 w-4" /> Demo &amp; Role Testing
      </h2>
      <p className="text-[11px] text-muted-foreground">
        Testing mode is {IS_TESTING_MODE ? "ON — every user is treated as Premium" : "OFF"}. Grant
        tier badges and focus hours below to test any rank state instantly.
      </p>

      <button
        type="button"
        onClick={() => {
          try {
            for (const f of getFracturedItems()) restoreItem(f.id, "easy");
            bypassAllTimers();
            localStorage.setItem("ftlb.devpass.bypass", String(Date.now()));
            window.dispatchEvent(new CustomEvent("devpass:bypass"));
            refresh();
            toast.success("Lockdown cleared and recall timers released");
          } catch {
            toast.error("Could not clear lockdown");
          }
        }}
        className="self-start rounded-xl bg-amber-400/15 px-3 py-2 text-[11px] font-black uppercase tracking-widest text-amber-300 ring-1 ring-amber-400/40 hover:bg-amber-400/25"
      >
        Bypass lockdown &amp; recall timers
      </button>


      <div className="flex flex-wrap items-end gap-2">
        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
          Focus hours
          <input
            type="number"
            min={0.5}
            step={0.5}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            className="mt-1 block w-24 rounded-lg bg-muted px-2 py-1.5 text-sm font-normal text-foreground"
          />
        </label>
        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
          Subject
          <select
            value={subject}
            onChange={(e) => setSubject(e.target.value as StudySubject)}
            className="mt-1 block w-40 rounded-lg bg-muted px-2 py-1.5 text-sm font-normal text-foreground"
          >
            {(["Physics", "Chemistry", "Math/Bio", "Other"] as StudySubject[]).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={addHours}
          className="rounded-lg bg-accent-amber px-3 py-2 text-[10px] font-black uppercase tracking-widest text-accent-amber-foreground"
        >
          Add focus hours
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No tracked chapters yet on this device — start one from the Library to test badges.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((it) => (
            <li key={it.id} className="rounded-xl bg-muted/40 p-2.5 ring-1 ring-border">
              <p className="truncate text-xs font-semibold">
                {it.name}
                <span className="ml-2 font-normal text-muted-foreground">
                  badge: {it.displayTier ? `Tier ${it.displayTier}` : "none"}
                </span>
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {([1, 2, 3, 4, 5] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => grant(it.id, t)}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ring-1 transition",
                      it.displayTier === t
                        ? "bg-accent-amber text-accent-amber-foreground ring-accent-amber"
                        : "text-muted-foreground ring-border",
                    )}
                  >
                    T{t}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => grant(it.id, null)}
                  className="rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-destructive ring-1 ring-destructive/40"
                >
                  Revoke
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
