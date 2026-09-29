import type { SearchKind } from "@/generated/model";
import { cn } from "@/lib/utils";
import { styleForKind } from "../../utils/searchKindColors";

interface SearchKindBadgeProps {
  kind: SearchKind;
  className?: string;
}

/**
 * A search kind, rendered on the EFFECT node — the kind describes how one
 * card sentence reaches its targets, so it belongs with the sentence rather
 * than repeated on each arrow leaving it.
 */
export function SearchKindBadge({ kind, className }: SearchKindBadgeProps) {
  const style = styleForKind(kind);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium leading-none whitespace-nowrap",
        style.badge,
        className,
      )}
    >
      {style.label}
    </span>
  );
}
