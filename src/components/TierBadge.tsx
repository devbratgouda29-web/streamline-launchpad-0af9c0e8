import { memo } from "react";
import { Shield, Cog, ShieldCheck, Snowflake, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export type TierNumber = 1 | 2 | 3 | 4 | 5;

type TierStyle = {
  name: string;
  from: string;
  to: string;
  ring: string;
  text: string;
  glow: string;
  Icon: typeof Shield;
  pulse?: boolean;
};

const STYLES: Record<TierNumber, TierStyle> = {
  1: {
    name: "Bronze Core",
    from: "oklch(0.55 0.12 45)",
    to: "oklch(0.28 0.09 40)",
    ring: "#A9683C",
    text: "oklch(0.96 0.03 60)",
    glow: "rgba(169,104,60,0.7)",
    Icon: Shield,
  },
  2: {
    name: "Iron Core",
    from: "oklch(0.42 0.02 260)",
    to: "oklch(0.22 0.01 260)",
    ring: "#EF4444",
    text: "oklch(0.96 0.01 260)",
    glow: "rgba(239,68,68,0.7)",
    Icon: Cog,
  },
  3: {
    name: "Steel Sentinel",
    from: "oklch(0.62 0.02 230)",
    to: "oklch(0.32 0.02 230)",
    ring: "#A855F7",
    text: "oklch(0.99 0.01 230)",
    glow: "rgba(168,85,247,0.7)",
    Icon: ShieldCheck,
  },
  4: {
    name: "Titanium Warden",
    from: "oklch(0.72 0.06 220)",
    to: "oklch(0.38 0.09 230)",
    ring: "#3B82F6",
    text: "oklch(0.99 0.02 220)",
    glow: "rgba(59,130,246,0.7)",
    Icon: Snowflake,
  },
  5: {
    name: "Platinum Core",
    from: "oklch(0.92 0.14 92)",
    to: "oklch(0.6 0.16 70)",
    ring: "#F5C542",
    text: "oklch(0.2 0.06 80)",
    glow: "rgba(245,197,66,0.75)",
    Icon: Sparkles,
  },
};


export function tierStyle(tier: TierNumber) {
  return STYLES[tier];
}

function TierBadgeBase({
  tier,
  size = 48,
  fractured = false,
  showLabel = false,
  loopCount = 0,
  className,
}: {
  tier: TierNumber;
  size?: number;
  fractured?: boolean;
  showLabel?: boolean;
  loopCount?: number;
  className?: string;
}) {
  const style = STYLES[tier];
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className={cn(
          "relative grid place-items-center rounded-xl",
          style.pulse && !fractured && "animate-pulse",
          fractured && "animate-pulse",
        )}
        style={{
          width: size,
          height: size,
          filter: fractured
            ? "drop-shadow(0 0 12px rgba(239, 68, 68, 0.8))"
            : `drop-shadow(0 4px 14px ${style.glow})`,
        }}
        aria-label={`${style.name}${fractured ? " (Fractured)" : ""}${loopCount > 0 ? ` x${loopCount + 1}` : ""}`}
      >
        <img
          src={`/cores/tier-${tier}.png`}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          draggable={false}
          className="pointer-events-none block select-none object-contain"
          style={{
            width: size,
            height: size,
            ...(fractured
              ? {
                  filter:
                    "grayscale(0.8) contrast(1.2) brightness(0.7) sepia(0.3) hue-rotate(-50deg)",
                }
              : null),
          }}
        />
        {fractured && (
          <span
            className="pointer-events-none absolute -left-1 -top-1 grid h-5 w-5 place-items-center rounded-full border border-red-300 bg-gradient-to-br from-red-500 to-red-800 text-[10px] font-black leading-none text-white shadow-[0_0_10px_rgba(239,68,68,0.9)]"
            aria-hidden
            title="Core fractured — restore via Debt Recall"
          >
            ✕
          </span>
        )}
        {loopCount > 0 && (
          <span
            className="pointer-events-none absolute -right-1 -top-1 rounded-full border border-amber-200 bg-gradient-to-br from-amber-300 to-amber-500 px-1.5 py-[1px] text-[9px] font-black leading-none text-black shadow-[0_0_8px_rgba(251,191,36,0.9)]"
            aria-hidden
          >
            x{loopCount + 1}
          </span>
        )}
      </div>
      {showLabel && (
        <span
          className="text-[10px] font-black uppercase tracking-[0.18em]"
          style={{ color: fractured ? "oklch(0.62 0.28 25)" : style.ring }}
        >
          {fractured ? "Fractured" : style.name}
          {loopCount > 0 && ` x${loopCount + 1}`}
        </span>
      )}
    </div>
  );
}

export const TierBadge = memo(TierBadgeBase);
