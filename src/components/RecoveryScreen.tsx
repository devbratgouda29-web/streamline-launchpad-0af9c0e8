import { useEffect } from "react";

/**
 * Last-resort fallback shown when the app tree crashes at runtime.
 * Instead of a solid black screen, the user sees a recovery message and is
 * safely returned to /home.
 */
export function RecoveryScreen({ onReset }: { onReset?: () => void }) {
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        onReset?.();
        if (typeof window !== "undefined" && window.location.pathname !== "/home") {
          window.location.assign("/home");
        }
      } catch {
        /* ignore */
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [onReset]);

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <p className="text-sm font-black uppercase tracking-[0.28em] text-amber-400">
        App Recovery Mode
      </p>
      <h1 className="mt-2 text-lg font-bold">Returning to Home</h1>
      <p className="mt-2 text-sm text-white/70">
        Something crashed while rendering. Taking you back to a safe screen…
      </p>
      <a
        href="/home"
        className="mt-6 inline-flex items-center justify-center rounded-md bg-amber-400 px-4 py-2 text-sm font-semibold text-black"
      >
        Go home now
      </a>
    </div>
  );
}
