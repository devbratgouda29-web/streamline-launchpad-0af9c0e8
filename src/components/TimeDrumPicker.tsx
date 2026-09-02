import { useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEM_H = 44;

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

/** Parse "HH:MM" (24h) into drum parts. */
function parse(value: string) {
  const [hRaw, mRaw] = value.split(":");
  const h24 = Math.min(23, Math.max(0, Number(hRaw) || 0));
  const m = Math.min(59, Math.max(0, Number(mRaw) || 0));
  const period: "AM" | "PM" = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return { h12, m, period };
}

function to24(h12: number, period: "AM" | "PM") {
  if (period === "AM") return h12 === 12 ? 0 : h12;
  return h12 === 12 ? 12 : h12 + 12;
}

function Drum({
  items,
  index,
  onIndex,
  label,
}: {
  items: string[];
  index: number;
  onIndex: (i: number) => void;
  label: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const settle = useRef<number | null>(null);

  // Keep the drum aligned when the value changes externally.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = index * ITEM_H;
    if (Math.abs(el.scrollTop - target) > 2) {
      el.scrollTo({ top: target, behavior: "auto" });
    }
  }, [index]);

  return (
    <div
      ref={ref}
      role="listbox"
      aria-label={label}
      onScroll={() => {
        const el = ref.current;
        if (!el) return;
        if (settle.current) window.clearTimeout(settle.current);
        settle.current = window.setTimeout(() => {
          const i = Math.max(
            0,
            Math.min(items.length - 1, Math.round(el.scrollTop / ITEM_H)),
          );
          if (i !== index) onIndex(i);
        }, 80);
      }}
      className="h-[132px] w-full snap-y snap-mandatory overflow-y-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{ scrollPaddingTop: ITEM_H }}
    >
      <div style={{ height: ITEM_H }} aria-hidden />
      {items.map((it, i) => (
        <button
          key={it}
          type="button"
          role="option"
          aria-selected={i === index}
          onClick={() => onIndex(i)}
          style={{ height: ITEM_H }}
          className={cn(
            "flex w-full snap-center items-center justify-center font-mono text-xl tabular-nums transition-all",
            i === index
              ? "scale-110 font-bold text-accent-amber"
              : "text-muted-foreground/60",
          )}
        >
          {it}
        </button>
      ))}
      <div style={{ height: ITEM_H }} aria-hidden />
    </div>
  );
}

const HOURS = Array.from({ length: 12 }, (_, i) => pad(i + 1));
const MINUTES = Array.from({ length: 60 }, (_, i) => pad(i));
const PERIODS = ["AM", "PM"];

/**
 * Dark drum-style scroll time picker replacing the native <input type="time">.
 * `value`/`onChange` use 24h "HH:MM".
 */
export function TimeDrumPicker({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement | null>(null);
  const { h12, m, period } = parse(value);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const commit = (nh: number, nm: number, np: "AM" | "PM") =>
    onChange(`${pad(to24(nh, np))}:${pad(nm)}`);

  return (
    <div ref={popRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-background px-4 py-3 text-left outline-none transition-colors hover:border-accent-amber/60 focus:border-accent-amber"
      >
        <span className="font-mono text-2xl tabular-nums text-foreground">
          {pad(h12)}:{pad(m)}
          <span className="ml-2 text-sm font-semibold tracking-widest text-accent-amber">
            {period}
          </span>
        </span>
        <Clock className="h-5 w-5 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 rounded-2xl border border-border bg-card p-3 shadow-2xl">
          <div className="relative">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-1/2 h-[44px] -translate-y-1/2 rounded-xl border border-accent-amber/40 bg-accent-amber/10"
            />
            <div className="relative grid grid-cols-3 gap-1">
              <Drum
                label="Hour"
                items={HOURS}
                index={h12 - 1}
                onIndex={(i) => commit(i + 1, m, period)}
              />
              <Drum
                label="Minute"
                items={MINUTES}
                index={m}
                onIndex={(i) => commit(h12, i, period)}
              />
              <Drum
                label="AM or PM"
                items={PERIODS}
                index={period === "AM" ? 0 : 1}
                onIndex={(i) => commit(h12, m, i === 0 ? "AM" : "PM")}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-3 w-full rounded-xl bg-accent-amber py-2.5 text-xs font-black uppercase tracking-widest text-accent-amber-foreground"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}
