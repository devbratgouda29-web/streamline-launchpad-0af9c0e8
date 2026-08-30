import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Safety net for every Supabase auth redirect (email confirmation, magic link,
 * OAuth). Never 404s: it settles the session, then sends the user to a real
 * screen instead of leaving them on an unknown URL.
 */
export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Signing you in — From The Last Bench" },
      { name: "description", content: "Completing your sign-in and returning you to the app." },
      { property: "og:title", content: "Signing you in — From The Last Bench" },
      { property: "og:description", content: "Completing your sign-in." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthCallback,
});

function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const hash = window.location.hash.startsWith("#")
          ? window.location.hash.slice(1)
          : window.location.hash;
        const params = new URLSearchParams(hash || window.location.search.slice(1));
        if (params.get("type") === "recovery") {
          window.location.replace(`/reset-password#${hash}`);
          return;
        }
        const { data } = await supabase.auth.getSession();
        if (!active) return;
        navigate({ to: data.session ? "/profile" : "/home", replace: true });
      } catch {
        if (active) navigate({ to: "/home", replace: true });
      }
    })();
    return () => {
      active = false;
    };
  }, [navigate]);

  return (
    <main className="grid min-h-screen place-items-center gap-3 bg-background p-6 text-center">
      <div>
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-amber-400" />
        <h1 className="mt-3 text-sm font-bold">Finishing sign-in…</h1>
        <p className="mt-1 text-xs text-muted-foreground">Taking you back to the app.</p>
      </div>
    </main>
  );
}
