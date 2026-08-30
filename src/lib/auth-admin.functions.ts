import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** The single designated admin account allowed to use the bypass below. */
const ADMIN_EMAIL = "devbratgouda29@gmail.com";

/**
 * Force-confirms the designated admin email and guarantees the `admin` role row.
 *
 * Scoped to ONE hard-coded address, and it never returns a session — the caller
 * still needs the correct password to actually sign in.
 */
export const ensureAdminAccount = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ email: z.string().email() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    if (data.email.trim().toLowerCase() !== ADMIN_EMAIL) {
      return { ok: false, error: "Not eligible" };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (listErr) return { ok: false, error: listErr.message };

    const user = list.users.find((u) => (u.email ?? "").toLowerCase() === ADMIN_EMAIL);
    if (!user) return { ok: false, error: "No admin account yet" };

    if (!user.email_confirmed_at) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
        email_confirm: true,
      });
      if (error) return { ok: false, error: error.message };
    }

    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: user.id, role: "admin" }, { onConflict: "user_id,role" });

    return { ok: true };
  });
