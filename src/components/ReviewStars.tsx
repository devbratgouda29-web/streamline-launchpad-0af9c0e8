import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  value: number;
  size?: number;
  onChange?: (value: number) => void;
  className?: string;
}

export function ReviewStars({ value, size = 16, onChange, className }: Props) {
  const interactive = typeof onChange === "function";
  return (
    <div className={cn("inline-flex items-center gap-0.5", className)} role={interactive ? "radiogroup" : undefined} aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= Math.round(value);
        const Cmp = interactive ? "button" : "span";
        return (
          <Cmp
            key={n}
            type={interactive ? "button" : undefined}
            onClick={interactive ? () => onChange!(n) : undefined}
            aria-label={interactive ? `${n} star${n > 1 ? "s" : ""}` : undefined}
            className={cn("leading-none", interactive && "cursor-pointer p-0.5")}
          >
            <Star
              style={{ width: size, height: size }}
              className={cn(
                "transition-colors",
                filled ? "fill-accent-amber text-accent-amber" : "text-muted-foreground/50",
              )}
              strokeWidth={1.5}
            />
          </Cmp>
        );
      })}
    </div>
  );
}
