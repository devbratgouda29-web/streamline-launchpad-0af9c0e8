import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, Lock, Mail, X } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { GATE_COPY, useAuth } from "@/hooks/use-auth";
import { ensureAdminAccount } from "@/lib/auth-admin.functions";

const credentialsSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(6, "Password must be at least 6 characters").max(72),
});

type Mode = "login" | "signup" | "forgot";

/** Designated admin account — gets fast-tracked straight to the console. */
export const ADMIN_EMAIL = "devbratgouda29@gmail.com";
/** Designated admin password — unlocks the console on a successful sign-in. */
const ADMIN_PASSWORD = "Dev2909@";
const isAdminEmail = (v: string) => v.trim().toLowerCase() === ADMIN_EMAIL;

/** Clear any legacy local admin flags — admin now comes from the real role. */
function clearLegacyAdminFlags() {
  try {
    if (typeof window === "undefined") return;
    localStorage.removeItem("ftlb.devpass.admin");
    localStorage.removeItem("isAdmin");
  } catch {
    /* ignore */
  }
}

export function AuthModal() {
  const { modalOpen, modalReason, closeAuthModal, session } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "email" | "google">(null);
  const [sent, setSent] = useState<null | "confirm" | "reset">(null);

  useEffect(() => {
    if (modalOpen) {
      setMode("signup");
      setError(null);
      setSent(null);
      setPassword("");
    }
  }, [modalOpen]);

  // Close automatically once a session lands (e.g. after OAuth).
  useEffect(() => {
    if (session && modalOpen) closeAuthModal();
  }, [session, modalOpen, closeAuthModal]);

  if (!modalOpen || typeof document === "undefined") return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === "forgot") {
      const parsed = z.string().trim().email().safeParse(email);
      if (!parsed.success) return setError("Enter a valid email");
      setBusy("email");
      const { error: err } = await supabase.auth.resetPasswordForEmail(parsed.data, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      setBusy(null);
      if (err) return setError(err.message);
      setSent("reset");
      return;
    }

    const parsed = credentialsSchema.safeParse({ email, password });
    if (!parsed.success) {
      return setError(parsed.error.issues[0]?.message ?? "Check your details");
    }

    const admin =
      isAdminEmail(parsed.data.email) && parsed.data.password === ADMIN_PASSWORD;
    const land = () => {
      clearLegacyAdminFlags();
      closeAuthModal();
      void navigate({ to: admin ? "/admin" : "/profile" });
    };

    setBusy("email");
    if (mode === "login") {
      let { error: err } = await supabase.auth.signInWithPassword(parsed.data);

      // Email-confirmation bypass for the designated admin account: confirm the
      // address server-side (and ensure the admin role), then retry the sign-in.
      if (err && admin && /confirm/i.test(err.message)) {
        const res = await ensureAdminAccount({ data: { email: parsed.data.email } });
        if (res.ok) {
          ({ error: err } = await supabase.auth.signInWithPassword(parsed.data));
        }
      }

      setBusy(null);
      if (err) {
        setError(
          err.message.toLowerCase().includes("invalid")
            ? "Invalid email or password."
            : err.message,
        );
        return;
      }
      if (admin) void ensureAdminAccount({ data: { email: parsed.data.email } });
      toast.success(admin ? "Admin access granted" : "Welcome back");
      land();
      return;
    }

    const { data, error: err } = await supabase.auth.signUp({
      ...parsed.data,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: {
          full_name: name.trim() || undefined,
          ...(admin ? { role: "admin" } : {}),
        },
      },
    });

    // Admin fast-path: skip the email-confirmation wall entirely — sign the
    // account straight in (works for both fresh and existing admin accounts).
    if (admin) {
      const { error: signInErr } = await supabase.auth.signInWithPassword(parsed.data);
      setBusy(null);
      if (!signInErr) {
        toast.success("Admin access granted");
        land();
        return;
      }
      setError(
        err?.message.toLowerCase().includes("already")
          ? "Admin account exists — enter the correct password to sign in."
          : (signInErr.message ?? "Could not sign in"),
      );
      setMode("login");
      return;
    }

    setBusy(null);
    if (err) {
      setError(
        err.message.toLowerCase().includes("already")
          ? "That email already has an account. Try logging in."
          : err.message,
      );
      return;
    }
    if (!data.session) {
      setSent("confirm");
      return;
    }
    toast.success("Account created");
    land();
  };

  const google = async () => {
    setError(null);
    setBusy("google");
    const notConfigured =
      "Google Login requires configuration in Supabase Dashboard. Please sign up using Email & Password.";
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        setBusy(null);
        const msg = result.error.message ?? "Google sign-in failed";
        if (/provider.*(google).*(not|un)\s*support|not enabled|unsupported provider/i.test(msg)) {
          toast.error(notConfigured, { duration: 3000 });
          setError(notConfigured);
          return;
        }
        setError(msg);
        toast.error(msg, { duration: 3000 });
        return;
      }
      if (result.redirected) return;
      setBusy(null);
      closeAuthModal();
      void navigate({ to: "/profile" });
    } catch (err) {
      setBusy(null);
      const msg = err instanceof Error ? err.message : "Google sign-in failed";
      if (/provider.*google.*not|not enabled|unsupported provider/i.test(msg)) {
        toast.error(notConfigured, { duration: 3000 });
        setError(notConfigured);
        return;
      }
      setError(msg);
      toast.error(msg, { duration: 3000 });
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[90] grid place-items-center bg-black/80 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeAuthModal();
      }}
      role="presentation"
    >
      <div className="w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 bg-neutral-950 text-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-6 pt-6 pb-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-400">
              From The Last Bench
            </p>
            <h2 className="mt-1 text-xl font-black">
              {mode === "signup"
                ? "Create your account"
                : mode === "forgot"
                  ? "Reset your password"
                  : "Sign in"}
            </h2>
            <p className="mt-1 text-xs text-white/60">{GATE_COPY[modalReason]}</p>
          </div>
          <button
            onClick={closeAuthModal}
            aria-label="Close"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/50 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-6">
          {sent ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-amber-400/15 text-amber-400">
                <Mail className="h-5 w-5" />
              </div>
              <p className="text-sm text-white/80">
                {sent === "confirm"
                  ? `We sent a confirmation link to ${email}. Click it to activate your account.`
                  : `We sent a password reset link to ${email}.`}
              </p>
              <button
                onClick={closeAuthModal}
                className="w-full rounded-2xl bg-white/10 px-4 py-3 text-sm font-bold hover:bg-white/15"
              >
                Got it
              </button>
            </div>
          ) : (
            <>
              <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-amber-400/15 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-amber-300">
                Recommended · Email &amp; password
              </p>
              <form
                onSubmit={submit}
                className="space-y-3 rounded-2xl border border-amber-400/40 bg-amber-400/[0.04] p-4"
              >
                {mode === "signup" && (
                  <Field
                    label="Full name"
                    value={name}
                    onChange={setName}
                    type="text"
                    placeholder="Your name"
                    maxLength={100}
                  />
                )}
                <Field
                  label="Email"
                  value={email}
                  onChange={setEmail}
                  type="email"
                  placeholder="you@example.com"
                  maxLength={255}
                />
                {mode !== "forgot" && (
                  <Field
                    label="Password"
                    value={password}
                    onChange={setPassword}
                    type="password"
                    placeholder="••••••••"
                    maxLength={72}
                  />
                )}

                {error && (
                  <p role="alert" className="rounded-xl bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-400">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={busy !== null}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-400 px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-black transition hover:bg-amber-300 disabled:opacity-60"
                >
                  {busy === "email" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                  {mode === "signup" ? "Create account" : mode === "forgot" ? "Send reset link" : "Log in"}
                </button>
              </form>

              <div className="my-5 flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">
                <span className="h-px flex-1 bg-white/10" /> or <span className="h-px flex-1 bg-white/10" />
              </div>

              <button
                onClick={google}
                disabled={busy !== null}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-black transition hover:bg-white/90 disabled:opacity-60"
              >
                {busy === "google" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <GoogleGlyph />
                )}
                Continue with Google
              </button>

              <div className="mt-5 space-y-2 text-center text-xs text-white/60">
                {mode !== "forgot" && (
                  <button
                    onClick={() => {
                      setMode(mode === "login" ? "signup" : "login");
                      setError(null);
                    }}
                    className="font-semibold text-white/80 underline-offset-4 hover:underline"
                  >
                    {mode === "login"
                      ? "New here? Create an account"
                      : "Already have an account? Log in"}
                  </button>
                )}
                <div>
                  <button
                    onClick={() => {
                      setMode(mode === "forgot" ? "login" : "forgot");
                      setError(null);
                    }}
                    className="hover:text-white"
                  >
                    {mode === "forgot" ? "Back to sign in" : "Forgot your password?"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Field({
  label,
  value,
  onChange,
  type,
  placeholder,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type: string;
  placeholder: string;
  maxLength: number;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={type}
        placeholder={placeholder}
        maxLength={maxLength}
        autoComplete={type === "password" ? "current-password" : type}
        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-amber-400/60"
      />
    </label>
  );
}

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.2-2.2H12v4.1h6.6c-.1 1.1-.9 2.8-2.5 4l3.8 2.9c2.3-2.1 3.6-5.2 3.6-8.8z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.8-2.9c-1 .7-2.4 1.2-4.2 1.2-3.2 0-5.9-2.1-6.8-5l-4 3c2 4 6.1 6.6 10.8 6.6z" />
      <path fill="#FBBC05" d="M5.2 14.4c-.2-.7-.4-1.5-.4-2.4s.1-1.6.4-2.4l-4-3.1C.4 8.3 0 10.1 0 12s.4 3.7 1.2 5.4l4-3z" />
      <path fill="#EA4335" d="M12 4.8c2.3 0 3.8.9 4.7 1.8l3.4-3.3C18 1.2 15.2 0 12 0 7.3 0 3.2 2.6 1.2 6.6l4 3.1c.9-2.9 3.6-4.9 6.8-4.9z" />
    </svg>
  );
}
