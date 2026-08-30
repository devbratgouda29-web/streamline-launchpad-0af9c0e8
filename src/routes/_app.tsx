import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BottomNav } from "@/components/BottomNav";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { RecoveryScreen } from "@/components/RecoveryScreen";
import { checkStreakStatus } from "@/lib/revision-engine";
import { isQuietHours } from "@/lib/notifications";
import { playShatter } from "@/lib/fracture-sfx";

export const Route = createFileRoute("/_app")({
  component: AppShell,
});

function AppShell() {
  // Hydration safeguard: every screen below reads localStorage-backed stores,
  // so we only render them after mount to guarantee server/client markup match.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const key = "ftlb.fractures.lastCheck";
    const now = Date.now();
    const midnight = new Date(now);
    midnight.setHours(0, 0, 0, 0);
    const last = Number(localStorage.getItem(key) ?? 0);
    const freshlyFractured = checkStreakStatus(now).broken;
    // Suppress the shatter alert during quiet hours (10PM–6AM).
    if (freshlyFractured.length > 0 && last < midnight.getTime() && !isQuietHours(now)) {
      playShatter();
    }
    localStorage.setItem(key, String(now));
  }, []);


  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col bg-background">
      <main className="flex-1 pb-24">
        {mounted ? (
          <ErrorBoundary fallback={(_err, reset) => <RecoveryScreen onReset={reset} />}>
            <Outlet />
          </ErrorBoundary>
        ) : (
          <div className="flex min-h-[60vh] items-center justify-center">
            <div className="h-8 w-8 animate-pulse rounded-full bg-muted" aria-hidden />
          </div>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
