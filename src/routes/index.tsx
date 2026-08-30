import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "From The Last Bench — Notes That Actually Make Sense" },
      {
        name: "description",
        content:
          "Study notes, focus tracking, recall drills and discipline habits in one app. Built for students who start from the last bench.",
      },
      {
        property: "og:title",
        content: "From The Last Bench — Notes That Actually Make Sense",
      },
      {
        property: "og:description",
        content:
          "Study notes, focus tracking, recall drills and discipline habits in one app.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SplashPage,
});

/**
 * Inline emblem fallback. If the CDN asset ever fails to resolve, we swap in
 * this self-contained SVG instead of letting the browser render raw alt text.
 */
const EMBLEM_FALLBACK =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" role="img" aria-label="From The Last Bench emblem">
      <circle cx="120" cy="120" r="112" fill="none" stroke="#fbbf24" stroke-width="6"/>
      <g stroke="#fbbf24" stroke-width="8" stroke-linecap="round" fill="none">
        <circle cx="120" cy="72" r="18" fill="#fbbf24"/>
        <path d="M120 92 V148"/>
        <path d="M120 106 L92 128 M120 106 L148 128"/>
        <path d="M120 148 L100 190 M120 148 L140 190"/>
      </g>
      <rect x="52" y="196" width="136" height="12" rx="6" fill="#fbbf24"/>
      <text x="120" y="232" text-anchor="middle" font-family="system-ui, sans-serif" font-size="18" font-weight="700" fill="#fbbf24">LAST BENCH</text>
    </svg>`,
  );

function SplashPage() {
  const navigate = useNavigate();
  const [src, setSrc] = useState("/splash-logo.png");

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        void navigate({ to: "/home", replace: true });
      } catch {
        window.location.assign("/home");
      }
    }, 7000);
    return () => clearTimeout(t);
  }, [navigate]);

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-background p-4 text-foreground">
      <div className="flex w-full flex-col items-center">
        <img
          src={src}
          onError={() => {
            if (src !== EMBLEM_FALLBACK) setSrc(EMBLEM_FALLBACK);
          }}
          alt="From The Last Bench stickman emblem"
          width={320}
          height={320}
          style={{ width: "100%", height: "auto", objectFit: "contain" }}
          className="mx-auto block max-w-[220px] drop-shadow-xl sm:max-w-[320px]"
          draggable={false}
        />
      </div>
      <p className="mt-[20px] max-w-xl px-6 text-center text-lg font-extrabold uppercase leading-snug tracking-wide text-amber-400 sm:text-xl md:text-2xl">
        The best brains of the nation may be found on the last bench of the classroom
      </p>
      <p className="mt-1 text-center text-sm font-medium text-zinc-100 sm:text-base">
        — Dr. A.P.J Abdul Kalam
      </p>
      <div className="mt-6 h-1 w-40 overflow-hidden rounded-full bg-primary-foreground/20">
        <div className="h-full w-full origin-left animate-[splash-progress_7s_linear_forwards] rounded-full bg-accent-amber" />
      </div>
    </div>
  );
}
