import { memo } from "react";
// Shared medieval core/habit shield badge used by both the live dashboard and
// the off-screen PDF canvas. Pure inline SVG so html2canvas can rasterise it.
function CoreShieldBase({
  color,
  glow,
  size = 84,
  label,
  fluid = false,
  tier,
}: {
  color: string;
  glow: string;
  size?: number;
  label?: string;
  /** Shrink to fit narrow grid columns while capping at `size`. */
  fluid?: boolean;
  /** Revision tier 1–5: render the custom /cores/tier-N.png asset instead of SVG. */
  tier?: 1 | 2 | 3 | 4 | 5;
}) {
  const uid = `${color.replace(/[^a-z0-9]/gi, "")}-${size}`;
  if (tier != null) {
    return (
      <img
        src={`/cores/tier-${tier}.png`}
        alt={label ?? `Tier ${tier} core`}
        width={fluid ? undefined : size}
        height={fluid ? undefined : size}
        loading="lazy"
        draggable={false}
        role="img"
        className="block select-none object-contain"
        style={{
          display: "block",
          width: fluid ? "100%" : size,
          height: "auto",
          maxWidth: size,
          filter: `drop-shadow(0 0 10px ${glow})`,
        }}
      />
    );
  }
  return (
    <svg
      viewBox="0 0 80 90"
      width={fluid ? "100%" : size}
      height={fluid ? undefined : size * (90 / 80)}
      style={{
        display: "block",
        filter: `drop-shadow(0 0 10px ${glow})`,
        ...(fluid ? { maxWidth: size, height: "auto" } : null),
      }}
      role="img"
      aria-label={label ?? "core shield"}
    >
      <defs>
        <linearGradient id={`cs-g-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.95" />
          <stop offset="55%" stopColor={color} stopOpacity="0.55" />
          <stop offset="100%" stopColor="#0A0D14" stopOpacity="1" />
        </linearGradient>
        <linearGradient id={`cs-s-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.5" />
          <stop offset="55%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M40 4 L74 16 V42 C74 64 60 80 40 86 C20 80 6 64 6 42 V16 Z"
        fill={`url(#cs-g-${uid})`}
        stroke={color}
        strokeWidth="2"
      />
      <path
        d="M40 4 L74 16 V42 C74 64 60 80 40 86 C20 80 6 64 6 42 V16 Z"
        fill={`url(#cs-s-${uid})`}
      />
      <circle cx="40" cy="40" r="10" fill="#0A0D14" stroke={color} strokeWidth="1.8" />
      <circle cx="40" cy="40" r="4" fill={color} />
    </svg>
  );
}

export const CoreShield = memo(CoreShieldBase);
