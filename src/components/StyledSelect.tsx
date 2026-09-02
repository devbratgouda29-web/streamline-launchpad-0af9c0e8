import { Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type StyledSelectOption<T extends string> = { value: T; label: string };

/**
 * Radix-powered replacement for native <select>, styled to match the app's
 * rounded dark card aesthetic.
 */
export function StyledSelect<T extends string>({
  value,
  options,
  onChange,
  className,
  ariaLabel,
  placeholder = "Select…",
}: {
  value: T;
  options: StyledSelectOption<T>[];
  onChange: (value: T) => void;
  className?: string;
  ariaLabel?: string;
  placeholder?: string;
}) {
  const current = options.find((o) => o.value === value);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2 text-left text-sm font-normal normal-case tracking-normal text-foreground outline-none transition-colors hover:border-accent-amber/60 focus:border-accent-amber data-[state=open]:border-accent-amber",
            className,
          )}
        >
          <span className="truncate">{current?.label ?? placeholder}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform data-[state=open]:rotate-180" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-72 w-[var(--radix-dropdown-menu-trigger-width)] min-w-44 overflow-auto rounded-xl border-border bg-card p-1 shadow-2xl"
      >
        {options.map((o) => {
          const active = o.value === value;
          return (
            <DropdownMenuItem
              key={o.value}
              onSelect={() => onChange(o.value)}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm",
                active && "bg-accent-amber/15 text-accent-amber focus:bg-accent-amber/20",
              )}
            >
              <span className="truncate">{o.label}</span>
              {active && <Check className="h-4 w-4 shrink-0" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
