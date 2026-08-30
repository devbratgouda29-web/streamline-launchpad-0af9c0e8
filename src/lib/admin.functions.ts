import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Throws unless the calling user holds the admin role. */
async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Forbidden");
}

export type AdminUser = {
  id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
  is_admin: boolean;
  purchases: number;
};

/** Every registered student, with role + purchase count. */
export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminUser[]> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: profiles }, { data: roles }, { data: purchases }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id, email, full_name, created_at")
        .order("created_at", { ascending: false }),
      supabaseAdmin.from("user_roles").select("user_id, role").eq("role", "admin"),
      supabaseAdmin.from("purchases").select("user_id"),
    ]);

    const adminIds = new Set((roles ?? []).map((r) => r.user_id));
    const counts = new Map<string, number>();
    for (const p of purchases ?? []) counts.set(p.user_id, (counts.get(p.user_id) ?? 0) + 1);

    return (profiles ?? []).map((p) => ({
      id: p.id,
      email: p.email,
      full_name: p.full_name,
      created_at: p.created_at,
      is_admin: adminIds.has(p.id),
      purchases: counts.get(p.id) ?? 0,
    }));
  });

/**
 * Grant or revoke the admin role for a user.
 *
 * This is the ONLY place that touches user roles. Content operations
 * (publishing / editing note packs) must never call it, so a chapter publish
 * can never surface the self-demotion guard below.
 *
 * The self-demotion guard returns a normal result instead of throwing, so the
 * UI can show a toast rather than crashing on an unhandled server exception.
 */
export const setUserAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid(), admin: z.boolean() }).parse(d))
  .handler(async ({ context, data }): Promise<{ ok: boolean; error?: string }> => {
    await assertAdmin(context);
    if (data.userId === context.userId && !data.admin) {
      return { ok: false, error: "You cannot remove your own admin access." };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.admin) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: data.userId, role: "admin" }, { onConflict: "user_id,role" });
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId)
        .eq("role", "admin");
      if (error) return { ok: false, error: error.message };
    }
    return { ok: true };
  });


export type AdminReview = {
  id: string;
  note_id: string;
  note_title: string | null;
  rating: number;
  headline: string | null;
  comment: string | null;
  author: string | null;
  hidden: boolean;
  created_at: string;
};

/** All reviews including hidden ones, newest first. */
export const listReviewsForModeration = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminReview[]> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: reviews }, { data: notes }, { data: profiles }] = await Promise.all([
      supabaseAdmin
        .from("reviews")
        .select(
          "id, note_id, rating, headline, comment, author_name, hidden, created_at, user_id",
        )
        .order("created_at", { ascending: false })
        .limit(200),
      supabaseAdmin.from("notes").select("id, title"),
      supabaseAdmin.from("profiles").select("id, full_name, email"),
    ]);

    const titles = new Map((notes ?? []).map((n) => [n.id, n.title]));
    const names = new Map(
      (profiles ?? []).map((p) => [p.id, p.full_name || p.email] as const),
    );

    return (reviews ?? []).map((r) => ({
      id: r.id,
      note_id: r.note_id,
      note_title: titles.get(r.note_id) ?? null,
      rating: r.rating,
      headline: r.headline,
      comment: r.comment,
      author: r.author_name ?? (r.user_id ? (names.get(r.user_id) ?? null) : null),
      hidden: r.hidden,
      created_at: r.created_at,
    }));
  });

/** Hide or unhide a review from the public store page. */
export const setReviewHidden = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ reviewId: z.string().uuid(), hidden: z.boolean() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("reviews")
      .update({ hidden: data.hidden })
      .eq("id", data.reviewId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type PurchaseAnalytics = {
  totalPurchases: number;
  totalRevenue: number;
  buyers: number;
  last7Days: number;
  last30Days: number;
  topNotes: { note_id: string; title: string; count: number; revenue: number }[];
};

/** Aggregate purchase + revenue summary across the catalogue. */
export const getPurchaseAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PurchaseAnalytics> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // `id` is selected so "Purchases" is a true COUNT(purchases.id) over every
    // completed transaction row, while "Buyers" is COUNT(DISTINCT user_id).
    const [{ data: purchases }, { data: notes }] = await Promise.all([
      supabaseAdmin.from("purchases").select("id, note_id, user_id, created_at"),
      supabaseAdmin.from("notes").select("id, title, price_inr"),
    ]);


    const noteMap = new Map((notes ?? []).map((n) => [n.id, n]));
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    let totalRevenue = 0;
    let last7Days = 0;
    let last30Days = 0;
    const buyers = new Set<string>();
    const per = new Map<string, { count: number; revenue: number }>();

    for (const p of purchases ?? []) {
      const price = noteMap.get(p.note_id)?.price_inr ?? 0;
      totalRevenue += price;
      buyers.add(p.user_id);
      const age = now - new Date(p.created_at).getTime();
      if (age <= 7 * day) last7Days += 1;
      if (age <= 30 * day) last30Days += 1;
      const row = per.get(p.note_id) ?? { count: 0, revenue: 0 };
      row.count += 1;
      row.revenue += price;
      per.set(p.note_id, row);
    }

    const topNotes = Array.from(per.entries())
      .map(([note_id, v]) => ({
        note_id,
        title: noteMap.get(note_id)?.title ?? "Removed chapter",
        count: v.count,
        revenue: v.revenue,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    return {
      // COUNT(purchases.id)
      totalPurchases: (purchases ?? []).filter((p) => p.id != null).length,
      totalRevenue,
      // COUNT(DISTINCT purchases.user_id)
      buyers: buyers.size,

      last7Days,
      last30Days,
      topNotes,
    };
  });
