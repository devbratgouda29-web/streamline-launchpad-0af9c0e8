import { Languages } from "lucide-react";
import type { ReadableLanguage } from "@/lib/notes-store";
import { LANGUAGE_DISCLAIMER } from "@/lib/language-preference";
import { cn } from "@/lib/utils";

const OPTIONS: { value: ReadableLanguage; label: string }[] = [
  { value: "hinglish", label: "Hinglish" },
  { value: "english", label: "English" },
];

/**
 * [ Hinglish | English ] pre-purchase switcher.
 * Flips the previewed sample pages and the PDF variant attached to a purchase.
 */
export function LanguageSwitcher({
  value,
  onChange,
  showDisclaimer = false,
  compact = false,
  className,
}: {
  value: ReadableLanguage;
  onChange: (lang: ReadableLanguage) => void;
  showDisclaimer?: boolean;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div
        role="group"
        aria-label="Choose note language"
        className={cn(
          "inline-flex items-center gap-1 self-start rounded-full bg-card p-1 ring-1 ring-border",
          compact && "p-0.5",
        )}
      >
        {!compact && (
          <Languages className="ml-2 mr-0.5 h-3.5 w-3.5 text-accent-amber" aria-hidden />
        )}
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-full font-bold uppercase tracking-widest transition",
              compact ? "px-2.5 py-1 text-[9px]" : "px-3.5 py-1.5 text-[10px]",
              value === o.value
                ? "bg-accent-amber text-accent-amber-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      {showDisclaimer && (
        <p className="max-w-prose text-[11px] leading-relaxed text-muted-foreground">
          {LANGUAGE_DISCLAIMER}
        </p>
      )}
    </div>
  );
}
