import { supabase } from "@/integrations/supabase/client";

/** Message shown when admin data needs a real signed-in session. */
export const NO_SESSION_MESSAGE =
  "Sign in with your admin account to load live data (local admin access is UI-only).";

/** True when a real Supabase session exists (server functions need its bearer token). */
export async function hasSupabaseSession(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession();
    return !!data.session;
  } catch {
    return false;
  }
}
