import { useState } from "react";
import { Shield } from "lucide-react";
import { WEEKLY_TIERS, type WeeklyTier, evaluateWeeklyTier } from "@/lib/weekly-badge";

type Size =
  | "xs"
  | "sm"
  | "trophy"
  | "md"
  | "lg"
  | "xl"
  | "xxl"
  | "3xl"
  | "4xl"
  | "rank"
  | "hero";

const SIZE_MAP: Record<Size, string> = {
  xs: "h-8 w-8",
  sm: "h-12 w-12",
  // Trophy case badges — ~40% larger than `sm` so they fill their cards.
  trophy: "h-[68px] w-[68px]",
  md: "h-20 w-20",
  xxl: "h-24 w-24",
  rank: "h-[140px] w-[140px]",
  "3xl": "h-36 w-36",
  "4xl": "h-44 w-44",
  // Hero banner emblem — fills the right edge of the rank card.
  hero: "h-48 w-48",
  lg: "h-32 w-32",
  xl: "h-56 w-56",
};

export function WeeklyBadge({
  tier,
  size = "sm",
  showLabel = false,
  locked = false,
  className = "",
}: {
  tier: WeeklyTier | null;
  size?: Size;
  showLabel?: boolean;
  locked?: boolean;
  className?: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  if (!tier) {
    // UNRANKED — subtle greyed-out frame placeholder, no active shield.
    return (
      <div className={"flex flex-col items-center gap-1 " + className}>
        <div
          className={
            "grid place-items-center rounded-full border border-dashed border-border bg-card/40 opacity-50 grayscale " +
            SIZE_MAP[size]
          }
          aria-label="Unranked — no badge earned yet"
        >
          <Shield className="h-1/2 w-1/2 text-muted-foreground" strokeWidth={1.5} />
        </div>
        {showLabel && (
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Unranked
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={"flex flex-col items-center gap-1 " + className}>
      <div
        className={"relative " + SIZE_MAP[size]}
        style={
          locked
            ? undefined
            : {
                filter: `drop-shadow(0 0 18px ${tier.glow}) drop-shadow(0 0 4px ${tier.glow})`,
              }
        }
      >
        {imgFailed || !tier.image ? (
          <div
            className={
              "grid h-full w-full place-items-center rounded-full border border-border bg-card/60 " +
              (locked ? "opacity-40 grayscale" : "")
            }
            aria-label={`${tier.name} badge`}
          >
            <Shield className={"h-1/2 w-1/2 " + (tier.accent ?? "text-muted-foreground")} />
          </div>
        ) : (
          <img
            src={tier.image}
            alt={`${tier.name} badge`}
            onError={() => setImgFailed(true)}
            className={
              "h-full w-full object-contain " +
              (locked ? "grayscale opacity-40" : "")
            }
            draggable={false}
          />
        )}
      </div>
      {showLabel && (
        <div className="text-center">

          <p className={"text-[10px] font-bold uppercase tracking-[0.14em] " + tier.accent}>
            T{tier.tier} · {tier.name}
          </p>
        </div>
      )}
    </div>
  );
}

export function WeeklyBadgeFromHours(props: {
  hours: number;
  size?: Size;
  showLabel?: boolean;
  className?: string;
}) {
  const tier = evaluateWeeklyTier(props.hours);
  return <WeeklyBadge {...props} tier={tier} />;
}

export { WEEKLY_TIERS };
