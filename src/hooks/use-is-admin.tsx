import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

/**
 * Client-side admin check (UI affordance only — real access is enforced by RLS
 * and the `has_role()` check inside every admin server function).
 *
 * A user counts as admin only when they have a real Supabase session AND hold
 * the `admin` role (via `user_roles`, or a `role` column on their profile).
 */
export function useIsAdmin() {
  const { user, profile, loading } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;

    if (loading) return;
    if (!user?.id) {
      setIsAdmin(false);
      return;
    }

    // Role stored on the user's `profiles` row.
    if (profile?.id === user.id && (profile.role ?? "").toLowerCase() === "admin") {
      setIsAdmin(true);
      return;
    }

    void (async () => {
      try {
        const { data } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "admin")
          .maybeSingle();
        if (active) setIsAdmin(!!data);
      } catch {
        if (active) setIsAdmin(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [user?.id, profile, loading]);


  return { isAdmin, checking: loading || isAdmin === null };
}
