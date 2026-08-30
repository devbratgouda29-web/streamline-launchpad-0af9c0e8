import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset Password — From The Last Bench" },
      { name: "description", content: "Choose a new password for your From The Last Bench account." },
      { property: "og:title", content: "Reset Password — From The Last Bench" },
      { property: "og:description", content: "Choose a new password for your account." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;
    const isRecovery = window.location.hash.includes("type=recovery");
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session || isRecovery) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, [mounted]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) return setError("Password must be at least 6 characters");
    if (password !== confirm) return setError("Passwords do not match");
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) return setError(err.message);
    toast.success("Password updated");
    navigate({ to: "/profile", replace: true });
  };

  if (!mounted) return null;

  return (
    <div className="grid min-h-[100dvh] place-items-center bg-neutral-950 px-5 text-white">
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-neutral-900/60 p-6">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-amber-400/15 text-amber-400">
          <KeyRound className="h-5 w-5" />
        </div>
        <h1 className="mt-4 text-xl font-black">Set a new password</h1>
        <p className="mt-1 text-xs text-white/60">
          {ready
            ? "Choose a strong password you haven't used before."
            : "Open this page from the reset link in your email."}
        </p>

        <form onSubmit={submit} className="mt-5 space-y-3">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password"
            maxLength={72}
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none placeholder:text-white/25 focus:border-amber-400/60"
          />
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirm password"
            maxLength={72}
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none placeholder:text-white/25 focus:border-amber-400/60"
          />
          {error && (
            <p role="alert" className="rounded-xl bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-400">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || !ready}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-400 px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-black hover:bg-amber-300 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Update password
          </button>
        </form>
      </div>
    </div>
  );
}
