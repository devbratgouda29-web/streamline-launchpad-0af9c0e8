import { useEffect, useState } from "react";
import { Sparkles, X, ChevronRight } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { pendingReportPrompt, ackReportPrompt } from "@/lib/weekly-badge";
import { isReportClaimed } from "@/lib/weekly-report-pdf";

export function PerformanceReportToast() {
  const [kind, setKind] = useState<"week" | "month" | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Delay so it doesn't fight route transitions.
    const t = setTimeout(() => {
      const pending = pendingReportPrompt();
      // Already claimed this cycle → banner stays dismissed for the rest of
      // the week/month.
      if (pending && isReportClaimed(pending)) return;
      setKind(pending);
    }, 800);
    return () => clearTimeout(t);
  }, []);

  if (!kind) return null;
  const label = kind === "week" ? "Weekly" : "Monthly";

  const dismiss = () => {
    ackReportPrompt(kind);
    setKind(null);
  };

  const goToReport = () => {
    ackReportPrompt(kind);
    setKind(null);
    navigate({
      to: "/performance",
      search: { view: kind === "week" ? "weekly" : "monthly", wrapped: false },
    }).catch(() => {});
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={goToReport}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") goToReport();
      }}
      className="fixed left-1/2 top-3 z-[80] w-[min(92vw,420px)] -translate-x-1/2 cursor-pointer rounded-2xl border border-accent-amber/60 bg-card/95 p-3 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.6)] backdrop-blur"
    >
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-amber/20 text-accent-amber">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-accent-amber">
            {label} performance report available
          </p>
          <p className="text-sm font-semibold">
            Head to Grand Performance Report to export
          </p>
          <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-accent-amber">
            Open Grand Performance Report <ChevronRight className="h-3 w-3" />
          </p>
        </div>
        <button
          aria-label="Dismiss"
          className="text-muted-foreground"
          onClick={(e) => {
            e.stopPropagation();
            dismiss();
          }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
