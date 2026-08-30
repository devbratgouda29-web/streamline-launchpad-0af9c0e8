import { useEffect } from "react";
import { Sparkles } from "lucide-react";
import { TierShieldSVG, tierForLevel, getBadgeAssetUrl } from "./RankShield";
import { cn } from "@/lib/utils";

export function RankUpCelebration({
  level,
  rankName,
  onDismiss,
}: {
  level: number;
  rankName: string;
  onDismiss: () => void;
}) {
  const tier = tierForLevel(level);
  const png = getBadgeAssetUrl(level);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-6 animate-fade-in"
      style={{
        background:
          `radial-gradient(60% 60% at 50% 45%, ${tier.glow} 0%, rgba(0,0,0,0.85) 55%, rgba(0,0,0,0.95) 100%)`,
        backdropFilter: "blur(6px)",
      }}
      role="dialog"
      aria-modal="true"
    >
      {/* Rotating halo */}
      <div
        aria-hidden
        className="pointer-events-none absolute h-[420px] w-[420px] rounded-full opacity-70"
        style={{
          background: `conic-gradient(from 0deg, transparent, ${tier.stroke}, transparent 60%)`,
          animation: "spin 6s linear infinite",
          maskImage:
            "radial-gradient(circle, transparent 42%, black 44%, black 60%, transparent 62%)",
          WebkitMaskImage:
            "radial-gradient(circle, transparent 42%, black 44%, black 60%, transparent 62%)",
        }}
      />

      <div className="relative flex flex-col items-center gap-6 text-center">
        <span
          className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.24em]"
          style={{ borderColor: tier.stroke, color: tier.stroke }}
        >
          <Sparkles className="h-3.5 w-3.5" />
          Rank Unlocked
        </span>

        <div
          className={cn("relative animate-scale-in")}
          style={{ animation: "rankup-float 2.6s ease-in-out infinite" }}
        >
          <div
            aria-hidden
            className="absolute inset-0 -m-6 rounded-full blur-3xl"
            style={{ background: tier.glow }}
          />
          {png ? (
            <img
              src={png}
              alt={`Rank ${level} badge`}
              className="relative h-56 w-56 object-contain"
              style={{ filter: `drop-shadow(0 12px 40px ${tier.glow})` }}
              draggable={false}
            />
          ) : (
            <div className="relative">
              <TierShieldSVG level={level} size={224} />
            </div>
          )}
        </div>

        <div className="max-w-md space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-white/70">
            Level {level} · {tier.name} Tier
          </p>
          <h1
            className="text-3xl font-black uppercase leading-tight tracking-[0.08em]"
            style={{ color: tier.stroke }}
          >
            {rankName}
          </h1>
          <p className="text-sm text-white/80">
            You have unlocked a new tier emblem. Wear it with pride, then get back to the grind.
          </p>
        </div>

        <button
          type="button"
          onClick={onDismiss}
          className="mt-2 rounded-2xl px-8 py-3 text-sm font-black uppercase tracking-[0.2em] text-white shadow-lg transition-transform active:scale-[0.97]"
          style={{
            background: `linear-gradient(90deg, ${tier.from}, ${tier.to})`,
            boxShadow: `0 10px 30px ${tier.glow}`,
          }}
        >
          Let's Go!
        </button>
      </div>

      <style>{`
        @keyframes rankup-float {
          0%, 100% { transform: translateY(0) rotate(-2deg); }
          50% { transform: translateY(-10px) rotate(2deg); }
        }
      `}</style>
    </div>
  );
}
