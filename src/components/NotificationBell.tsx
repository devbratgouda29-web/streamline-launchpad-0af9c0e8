import { useEffect, useState } from "react";
import { Bell, BellOff, AlertTriangle, Flame, FileDown, Clock } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ackReportPrompt } from "@/lib/weekly-badge";
import {
  buildNotifications,
  clearAllNotifications,
  type AppNotification,
} from "@/lib/notifications";


const ICONS = {
  recall: Clock,
  fracture: AlertTriangle,
  report: FileDown,
  habit: Flame,
} as const;

export function NotificationBell() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();


  useEffect(() => {
    const refresh = () => setItems(buildNotifications());
    refresh();
    window.addEventListener("ftlb:notifications", refresh);
    window.addEventListener("ftlb:report-claimed", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("ftlb:notifications", refresh);
      window.removeEventListener("ftlb:report-claimed", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label="Notifications"
          className="relative grid h-10 w-10 place-items-center rounded-full bg-card text-foreground ring-1 ring-border"
        >
          <Bell className="h-5 w-5" />
          {items.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[9px] font-black text-primary-foreground">
              {items.length}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(88vw,340px)] p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-accent-amber">
            Notifications
          </p>
          {items.length > 0 && (
            <button
              onClick={() => {
                clearAllNotifications();
                setItems([]);
              }}
              className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground"
            >
              Clear all
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <BellOff className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-semibold">All clear</p>
            <p className="text-xs text-muted-foreground">
              No alerts right now. Keep the streak running.
            </p>
          </div>
        ) : (
          <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto">
            {items.map((n) => {
              const Icon = ICONS[n.kind] ?? Bell;
              const isReport = n.id.startsWith("report:available:");
              const kind = n.id.endsWith("month") ? "month" : "week";
              return (
                <li
                  key={n.id}
                  role={isReport ? "button" : undefined}
                  tabIndex={isReport ? 0 : undefined}
                  onClick={
                    isReport
                      ? () => {
                          ackReportPrompt(kind);
                          setOpen(false);
                          navigate({
                            to: "/performance",
                            search: {
                              view: kind === "month" ? "monthly" : "weekly",
                              wrapped: false,
                            },
                          }).catch(() => {});
                        }
                      : undefined
                  }
                  className={
                    "flex gap-3 px-3 py-3" +
                    (isReport ? " cursor-pointer hover:bg-accent-amber/10" : "")
                  }
                >
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-amber/15 text-accent-amber">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold">{n.title}</p>
                    <p className="text-[11px] leading-snug text-muted-foreground">{n.body}</p>
                  </div>
                </li>
              );
            })}

          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
