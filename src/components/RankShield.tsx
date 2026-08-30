import { Shield, Medal, Trophy, Crown, Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";


// Lookup PNG override in src/assets/badges/rank_${level}.png if present.
// import.meta.glob returns an empty object when the folder doesn't exist yet,
// so this stays safe even before art is uploaded.
const badgeUrlMap = import.meta.glob(
  "/src/assets/badges/rank_*.png",
  { eager: true, query: "?url", import: "default" },
) as Record<string, string>;

export function getBadgeAssetUrl(level: number): string | null {
  const key = `/src/assets/badges/rank_${level}.png`;
  return badgeUrlMap[key] ?? null;
}

type Tier = {
  name: string;
  from: string; // oklch / hex ok
  to: string;
  stroke: string;
  glow: string;
  text: string;
  icon: "shield" | "medal" | "trophy" | "crown" | "flame";
};

// 5 tiers spanning 15 levels
const TIERS: Tier[] = [
  {
    name: "Bronze",
    from: "oklch(0.68 0.13 55)",
    to: "oklch(0.38 0.11 45)",
    stroke: "oklch(0.82 0.12 70)",
    glow: "oklch(0.68 0.16 55 / 0.55)",
    text: "oklch(0.98 0.02 80)",
    icon: "shield",
  },
  {
    name: "Silver",
    from: "oklch(0.86 0.02 250)",
    to: "oklch(0.55 0.03 250)",
    stroke: "oklch(0.96 0.02 250)",
    glow: "oklch(0.85 0.05 250 / 0.55)",
    text: "oklch(0.2 0.03 250)",
    icon: "medal",
  },
  {
    name: "Gold",
    from: "oklch(0.88 0.16 92)",
    to: "oklch(0.55 0.16 70)",
    stroke: "oklch(0.95 0.14 92)",
    glow: "oklch(0.85 0.18 88 / 0.6)",
    text: "oklch(0.2 0.06 80)",
    icon: "trophy",
  },
  {
    name: "Platinum",
    from: "oklch(0.9 0.05 200)",
    to: "oklch(0.55 0.09 220)",
    stroke: "oklch(0.96 0.06 200)",
    glow: "oklch(0.85 0.12 210 / 0.6)",
    text: "oklch(0.98 0.01 210)",
    icon: "crown",
  },
  {
    name: "Neon Crimson",
    from: "oklch(0.72 0.28 25)",
    to: "oklch(0.35 0.22 20)",
    stroke: "oklch(0.85 0.24 28)",
    glow: "oklch(0.7 0.3 25 / 0.75)",
    text: "oklch(0.99 0.02 25)",
    icon: "flame",
  },
];

export function tierForLevel(level: number): Tier {
  const idx = Math.min(TIERS.length - 1, Math.max(0, Math.floor((level - 1) / 3)));
  return TIERS[idx];
}

function TierIcon({ name, className }: { name: Tier["icon"]; className?: string }) {
  const props = { className, strokeWidth: 2.25 };
  switch (name) {
    case "medal":
      return <Medal {...props} />;
    case "trophy":
      return <Trophy {...props} />;
    case "crown":
      return <Crown {...props} />;
    case "flame":
      return <Flame {...props} />;
    default:
      return <Shield {...props} />;
  }
}

/** Sleek dynamic SVG shield used when no PNG asset is present. */
export function TierShieldSVG({
  level,
  size = 168,
  animate = false,
  showNumber = true,
}: {
  level: number;
  size?: number;
  animate?: boolean;
  showNumber?: boolean;
}) {
  const tier = tierForLevel(level);
  const gid = `rank-grad-${level}`;
  const sid = `rank-sheen-${level}`;
  return (
    <div
      className={cn("relative grid place-items-center", animate && "animate-pulse")}
      style={{ width: size, height: size, filter: `drop-shadow(0 8px 28px ${tier.glow})` }}
    >
      <svg viewBox="0 0 120 132" width={size} height={size}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={tier.from} />
            <stop offset="100%" stopColor={tier.to} />
          </linearGradient>
          <linearGradient id={sid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity="0.45" />
            <stop offset="55%" stopColor="white" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M60 4 L110 20 V62 C110 96 88 118 60 128 C32 118 10 96 10 62 V20 Z"
          fill={`url(#${gid})`}
          stroke={tier.stroke}
          strokeWidth="2.5"
        />
        <path
          d="M60 4 L110 20 V62 C110 96 88 118 60 128 C32 118 10 96 10 62 V20 Z"
          fill={`url(#${sid})`}
        />
        {showNumber && (
          <text
            x="60"
            y="88"
            textAnchor="middle"
            fontFamily="Poppins, ui-sans-serif, sans-serif"
            fontWeight="900"
            fontSize="42"
            fill={tier.text}
            style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.25)", strokeWidth: 1 }}
          >
            {level}
          </text>
        )}
      </svg>
      <div
        className="absolute"
        style={{ top: size * 0.22, color: tier.text }}
      >
        <TierIcon name={tier.icon} className="h-6 w-6 opacity-90" />
      </div>
    </div>
  );
}

/** Hero shield image with graceful fallback to the generated SVG. */
function HeroShieldImg({ level, tier }: { level: number; tier: Tier }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <TierShieldSVG level={level} size={192} />;
  }
  return (
    <img
      src={`/shields/shield-${level}.png`}
      alt={`Rank ${level} shield`}
      onError={() => setFailed(true)}
      className="w-48 h-48 md:w-56 md:h-56 mx-auto object-contain drop-shadow-xl select-none transition-all"
      draggable={false}
    />
  );
}

/** Prominent top-of-dashboard rank shield frame. */
export function RankShieldFrame({

  level,
  rankName,
  streak,
  nextStreak,
  nextRankName,
}: {
  level: number;
  rankName: string;
  streak: number;
  nextStreak: number | null;
  nextRankName: string | null;
}) {
  const tier = tierForLevel(level);
  const png = getBadgeAssetUrl(level);
  const remaining = nextStreak !== null ? Math.max(0, nextStreak - streak) : 0;
  const progressBase = nextStreak !== null
    ? Math.min(100, Math.max(0, ((streak) / Math.max(1, nextStreak)) * 100))
    : 100;

  return (
    <section
      className="relative overflow-hidden rounded-3xl border p-5"
      style={{
        borderColor: tier.stroke,
        background:
          `radial-gradient(120% 80% at 50% 0%, ${tier.glow} 0%, transparent 60%),` +
          ` linear-gradient(180deg, color-mix(in oklab, ${tier.from} 18%, transparent), transparent)`,
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full blur-3xl"
        style={{ background: tier.glow }}
      />
      <div className="relative flex flex-col items-center gap-3">
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.2em]"
          style={{ borderColor: tier.stroke, color: tier.stroke }}
        >
          <TierIcon name={tier.icon} className="h-3 w-3" />
          {tier.name} Tier · Lvl {level} / 15
        </span>

        <HeroShieldImg level={level} tier={tier} />

        <h2
          className="text-center text-lg font-black uppercase tracking-[0.14em]"
          style={{ color: tier.stroke }}
        >
          {rankName}
        </h2>


        <div className="w-full">
          <div className="mb-1.5 flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">
              {nextRankName ? (
                <>Next: <span className="font-semibold text-foreground/85">{nextRankName}</span></>
              ) : (
                <span className="font-semibold text-foreground/85">Max rank reached</span>
              )}
            </span>
            {nextRankName && (
              <span className="font-bold" style={{ color: tier.stroke }}>
                {remaining}d to go
              </span>
            )}
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full transition-all"
              style={{
                width: `${progressBase}%`,
                background: `linear-gradient(90deg, ${tier.from}, ${tier.to})`,
                boxShadow: `0 0 12px ${tier.glow}`,
              }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
